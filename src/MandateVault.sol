// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMarginBank, IPerpPool} from "./interfaces/IDreamDex.sol";

/// @title MandateVault
/// @notice A dreamDEX perps vault: depositors pool USDso, one leader trades it, and the contract
///         enforces the leader's mandate on every order. The leader has no way to move funds out.
///         Only redeem() pays USDso, and it pays the redeeming shareholder.
/// @dev    The vault is its own MarginBank account and places orders as owner (no operator grant).
///         The only token approval it ever grants is to the MarginBank, for the exact deposit amount.
contract MandateVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types
    struct Mandate {
        address[] allowedPools;
        /// Max Σ worst-case notional / NAV, ×100 (300 = 3x).
        uint256 maxLeverageX1e2;
        /// Max worst-case notional per pool, in collateral wei.
        uint256 maxNotionalPerPool;
        /// Reduce-only once price-per-share falls this far below its high-water mark.
        uint16 drawdownBps;
        /// Performance fee on gains above the high-water mark, paid in new shares to the leader.
        uint16 perfFeeBps;
        /// Minimum fraction of supply the leader must hold while anyone else holds shares.
        uint16 leaderMinShareBps;
        /// Shares are locked this long after each deposit (redeem and transfer).
        uint32 lockSeconds;
        /// Optional builder code attached to every order (0 = none) and its fee (bps × 1000).
        address builder;
        uint96 builderFeeBpsTimes1k;
    }

    // ------------------------------------------------------------------ constants
    uint256 public constant PPS_SCALE = 1e18;
    uint256 public constant BPS = 10_000;
    /// First deposit floor: with 18-dp shares, this makes a share-price inflation attack uneconomic.
    uint256 public constant MIN_FIRST_DEPOSIT = 1e18;
    /// Resting orders expire after this long.
    uint64 public constant ORDER_TTL = 1 days;
    /// Keeper close-outs cross the book by at most this much from mark.
    uint256 public constant CLOSE_SLIPPAGE_BPS = 300;
    uint8 public constant ORDER_TYPE_IOC = 2;
    /// Others holding at most this many share-wei (~1e-6 USDso) do not bind the leader minimum,
    /// so unredeemable dust cannot trap the leader (found by testFuzz_shareMath).
    uint256 public constant DUST_SHARES = 1e12;

    // ------------------------------------------------------------------ immutable settings
    IERC20 public immutable collateral;
    IMarginBank public immutable marginBank;
    address public immutable leader;
    address public immutable factory;
    uint256 public immutable maxLeverageX1e2;
    uint256 public immutable maxNotionalPerPool;
    uint16 public immutable drawdownBps;
    uint16 public immutable perfFeeBps;
    uint16 public immutable leaderMinShareBps;
    uint32 public immutable lockSeconds;
    address public immutable builder;
    uint96 public immutable builderFeeBpsTimes1k;

    /// Set once in the constructor and never written again (arrays cannot be `immutable`).
    address[] private _allowedPools;
    mapping(address pool => bool) public isAllowedPool;
    mapping(address pool => uint256) public oneBaseOf;

    // ------------------------------------------------------------------ state
    /// High-water mark of price-per-share (PPS_SCALE = 1.0).
    uint256 public highWaterMark;
    /// Latched on a drawdown breach. Only position-reducing trades are allowed from then on.
    bool public reduceOnly;
    mapping(address account => uint256) public lockedUntil;

    // ------------------------------------------------------------------ events
    event Deposited(address indexed account, uint256 assets, uint256 shares, uint256 navBefore, uint256 pricePerShare);
    event Redeemed(address indexed account, uint256 shares, uint256 assets, uint256 navBefore, uint256 pricePerShare);
    event Traded(
        address indexed pool,
        bool isBid,
        uint256 price,
        uint256 quantity,
        uint8 orderType,
        uint128 orderId,
        bool reducing,
        uint256 worstCaseNotional,
        uint256 totalNotional,
        uint256 nav
    );
    event OrdersCancelled(address indexed pool, uint256 count, address indexed by);
    event PositionCloseSent(address indexed pool, int256 size, uint256 price, uint128 orderId, address indexed by);
    event MandateBreached(uint256 pricePerShare, uint256 highWaterMark, uint256 nav);
    event FeeCrystallized(uint256 feeShares, uint256 feeAssets, uint256 ppsBefore, uint256 ppsAfter);

    // ------------------------------------------------------------------ errors
    error NotLeader();
    error NotAuthorized();
    error MarketNotAllowed();
    error NotionalCapExceeded(uint256 notional, uint256 cap);
    error LeverageCapExceeded(uint256 totalNotional, uint256 nav, uint256 maxLeverageX1e2);
    error ReduceOnly();
    error ZeroAmount();
    error ZeroShares();
    error LeaderMustDepositFirst();
    error FirstDepositTooSmall(uint256 minimum);
    error SharesLocked(uint256 until);
    error LeaderShareTooLow(uint256 leaderShares, uint256 supply, uint256 minBps);
    error InsufficientFreeMargin(uint256 needed, uint256 withdrawable);
    error NavUnavailable();
    error MarkUnavailable(address pool);
    error OrderRejected();
    error InvalidMandate();

    // ------------------------------------------------------------------ construction
    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 collateral_,
        IMarginBank marginBank_,
        address leader_,
        Mandate memory m
    ) ERC20(name_, symbol_) {
        if (leader_ == address(0) || m.allowedPools.length == 0) revert InvalidMandate();
        if (m.maxLeverageX1e2 == 0 || m.maxNotionalPerPool == 0) revert InvalidMandate();
        if (m.drawdownBps == 0 || m.drawdownBps >= BPS || m.perfFeeBps > 5_000 || m.leaderMinShareBps > BPS) {
            revert InvalidMandate();
        }
        collateral = collateral_;
        marginBank = marginBank_;
        leader = leader_;
        factory = msg.sender;
        maxLeverageX1e2 = m.maxLeverageX1e2;
        maxNotionalPerPool = m.maxNotionalPerPool;
        drawdownBps = m.drawdownBps;
        perfFeeBps = m.perfFeeBps;
        leaderMinShareBps = m.leaderMinShareBps;
        lockSeconds = m.lockSeconds;
        builder = m.builder;
        builderFeeBpsTimes1k = m.builderFeeBpsTimes1k;
        if (m.builder == address(0) && m.builderFeeBpsTimes1k != 0) revert InvalidMandate();

        for (uint256 i; i < m.allowedPools.length; ++i) {
            address pool = m.allowedPools[i];
            if (isAllowedPool[pool] || IPerpPool(pool).marginBank() != address(marginBank_)) revert InvalidMandate();
            isAllowedPool[pool] = true;
            oneBaseOf[pool] = IPerpPool(pool).getOneBase();
            _allowedPools.push(pool);
            // Fee-cap approval for the builder code. Not a token approval: no pool can spend USDso.
            if (m.builder != address(0)) IPerpPool(pool).approveBuilder(m.builder, m.builderFeeBpsTimes1k);
        }
    }

    modifier onlyLeader() {
        if (msg.sender != leader) revert NotLeader();
        _;
    }

    /// Leader always; anyone once the mandate is breached (so a keeper can de-risk).
    modifier onlyLeaderOrBreached() {
        if (msg.sender != leader && !reduceOnly) revert NotAuthorized();
        _;
    }

    // ------------------------------------------------------------------ views
    function allowedPools() external view returns (address[] memory) {
        return _allowedPools;
    }

    function mandate() external view returns (Mandate memory m) {
        m.allowedPools = _allowedPools;
        m.maxLeverageX1e2 = maxLeverageX1e2;
        m.maxNotionalPerPool = maxNotionalPerPool;
        m.drawdownBps = drawdownBps;
        m.perfFeeBps = perfFeeBps;
        m.leaderMinShareBps = leaderMinShareBps;
        m.lockSeconds = lockSeconds;
        m.builder = builder;
        m.builderFeeBpsTimes1k = builderFeeBpsTimes1k;
    }

    /// NAV = bank equity (free collateral + uPnL at mark − funding) + collateral locked behind
    /// resting orders + USDso held in the vault's wallet. Floored at 0.
    function tryNav() public view returns (bool ok, uint256 value) {
        (bool eqOk, int256 equity) = marginBank.tryGetAccountEquity(address(this));
        if (!eqOk) return (false, 0);
        IMarginBank.AccountState memory st = marginBank.getAccountState(address(this));
        int256 v = equity + int256(st.lockedCollateral) + int256(collateral.balanceOf(address(this)));
        return (true, v > 0 ? uint256(v) : 0);
    }

    function nav() public view returns (uint256 value) {
        bool ok;
        (ok, value) = tryNav();
        if (!ok) revert NavUnavailable();
    }

    function pricePerShare() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return PPS_SCALE;
        return (nav() * PPS_SCALE) / supply;
    }

    /// Shares minted for `assets` at the current NAV (before any pending fee crystallization).
    function previewDeposit(uint256 assets) external view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / nav();
    }

    function previewRedeem(uint256 shares) external view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? 0 : (shares * nav()) / supply;
    }

    /// Σ over allowed pools of the worst-case notional (position plus every resting order filling).
    function totalNotional() public view returns (uint256 total) {
        for (uint256 i; i < _allowedPools.length; ++i) {
            total += _worstCaseNotional(_allowedPools[i], false, 0);
        }
    }

    // ------------------------------------------------------------------ deposit / redeem
    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        uint256 navBefore;
        if (supply == 0) {
            if (msg.sender != leader) revert LeaderMustDepositFirst();
            if (assets < MIN_FIRST_DEPOSIT) revert FirstDepositTooSmall(MIN_FIRST_DEPOSIT);
            navBefore = nav();
            shares = assets; // 1:1 when empty
        } else {
            navBefore = _checkpoint(true);
            if (reduceOnly) revert ReduceOnly();
            // Re-read: the checkpoint may have minted fee shares. Pricing on the pre-fee supply
            // would short-change this depositor (caught by test_fee_crystallizesBeforeDepositAndRedeem).
            supply = totalSupply();
            shares = (assets * supply) / navBefore; // rounds down, in the vault's favour
        }
        if (shares == 0) revert ZeroShares();

        collateral.safeTransferFrom(msg.sender, address(this), assets);
        // The ONLY approval the vault ever grants: the MarginBank, for exactly this deposit.
        collateral.forceApprove(address(marginBank), assets);
        marginBank.deposit(assets);
        if (collateral.allowance(address(this), address(marginBank)) != 0) collateral.forceApprove(address(marginBank), 0);

        _mint(msg.sender, shares);
        lockedUntil[msg.sender] = block.timestamp + lockSeconds;
        _requireLeaderShare();

        uint256 pps = ((navBefore + assets) * PPS_SCALE) / totalSupply();
        if (supply == 0) highWaterMark = pps; // first deposit (supply stays 0 only on this path)
        emit Deposited(msg.sender, assets, shares, navBefore, pps);
    }

    function redeem(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        uint256 until = lockedUntil[msg.sender];
        if (block.timestamp < until) revert SharesLocked(until);

        uint256 navBefore = _checkpoint(true);
        uint256 supply = totalSupply();
        assets = (shares * navBefore) / supply; // rounds down
        if (assets == 0) revert ZeroAmount();

        _burn(msg.sender, shares); // reverts on insufficient balance
        _requireLeaderShare();

        uint256 wallet = collateral.balanceOf(address(this));
        if (wallet < assets) {
            uint256 need = assets - wallet;
            uint256 withdrawable = marginBank.getWithdrawableCollateral(address(this));
            if (withdrawable < need) revert InsufficientFreeMargin(need, withdrawable);
            marginBank.withdraw(need);
        }
        collateral.safeTransfer(msg.sender, assets);
        uint256 supplyAfter = totalSupply();
        emit Redeemed(msg.sender, shares, assets, navBefore, supplyAfter == 0 ? PPS_SCALE : ((navBefore - assets) * PPS_SCALE) / supplyAfter);
    }

    // ------------------------------------------------------------------ trading
    /// Leader-only order, placed by the vault as owner. Margin comes from the vault's bank account.
    function trade(address pool, bool isBid, uint256 price, uint256 quantity, uint8 orderType)
        external
        onlyLeader
        nonReentrant
        returns (uint128 orderId)
    {
        if (!isAllowedPool[pool]) revert MarketNotAllowed();
        if (quantity == 0) revert ZeroAmount();
        uint256 navNow = _checkpoint(true);

        IPerpPool.ReducingCapacity memory cap = IPerpPool(pool).getReducingCapacity(address(this));
        bool reducing = _isReducing(cap, isBid, quantity);
        if (reduceOnly && !reducing) revert ReduceOnly();

        uint256 poolNotional;
        uint256 total;
        if (!reducing) {
            // Worst case after this order: the position plus every same-side resting order
            // (this one included) filling at mark.
            poolNotional = _worstCaseNotional(pool, isBid, quantity);
            if (poolNotional > maxNotionalPerPool) revert NotionalCapExceeded(poolNotional, maxNotionalPerPool);
            total = poolNotional;
            for (uint256 i; i < _allowedPools.length; ++i) {
                if (_allowedPools[i] != pool) total += _worstCaseNotional(_allowedPools[i], false, 0);
            }
            if (total * 100 > maxLeverageX1e2 * navNow) revert LeverageCapExceeded(total, navNow, maxLeverageX1e2);
        }

        orderId = _place(pool, isBid, price, quantity, orderType);
        emit Traded(pool, isBid, price, quantity, orderType, orderId, reducing, poolNotional, total, navNow);
    }

    function cancel(address pool, uint128[] calldata orderIds) external onlyLeader nonReentrant {
        if (!isAllowedPool[pool]) revert MarketNotAllowed();
        for (uint256 i; i < orderIds.length; ++i) {
            IPerpPool(pool).cancelOrder(orderIds[i]);
        }
        emit OrdersCancelled(pool, orderIds.length, msg.sender);
    }

    /// Cancel every resting order the vault owns on `pool`. Leader, or anyone once breached.
    function cancelAll(address pool) external onlyLeaderOrBreached nonReentrant {
        if (!isAllowedPool[pool]) revert MarketNotAllowed();
        _cancelAll(pool);
    }

    /// Cancel resting orders on `pool`, then send an IOC for the whole position, crossing the
    /// book by at most CLOSE_SLIPPAGE_BPS from mark. Leader, or anyone once breached.
    function closePosition(address pool) external onlyLeaderOrBreached nonReentrant returns (uint128 orderId) {
        if (!isAllowedPool[pool]) revert MarketNotAllowed();
        _cancelAll(pool);
        int256 size = int256(marginBank.getPosition(address(this), pool).size);
        if (size == 0) return 0;
        uint256 mark = _mark(pool);
        uint256 tick = IPerpPool(pool).getOrderBookParameters().tickSize;
        bool isBid = size < 0; // buy back a short, sell a long
        uint256 price;
        if (isBid) {
            price = (mark * (BPS + CLOSE_SLIPPAGE_BPS)) / BPS;
            price = ((price + tick - 1) / tick) * tick;
        } else {
            price = (mark * (BPS - CLOSE_SLIPPAGE_BPS)) / BPS;
            price = (price / tick) * tick;
        }
        uint256 qty = uint256(size < 0 ? -size : size);
        orderId = _place(pool, isBid, price, qty, ORDER_TYPE_IOC);
        emit PositionCloseSent(pool, size, price, orderId, msg.sender);
    }

    // ------------------------------------------------------------------ checkpoint
    /// Crystallize the performance fee above the high-water mark, or latch reduce-only on a
    /// drawdown breach. Callable by anyone.
    function checkpoint() external nonReentrant returns (uint256) {
        return _checkpoint(false);
    }

    /// @return navNow the NAV used (fee shares change supply, not NAV).
    function _checkpoint(bool requireNav) internal returns (uint256 navNow) {
        bool ok;
        (ok, navNow) = tryNav();
        if (!ok) {
            if (requireNav) revert NavUnavailable();
            return 0;
        }
        uint256 supply = totalSupply();
        if (supply == 0) return navNow;
        uint256 pps = (navNow * PPS_SCALE) / supply;
        uint256 hwm = highWaterMark;

        if (pps > hwm) {
            uint256 feeAssets = ((pps - hwm) * supply * perfFeeBps) / (PPS_SCALE * BPS);
            uint256 feeShares = feeAssets == 0 ? 0 : (feeAssets * supply) / (navNow - feeAssets);
            if (feeShares > 0) _mint(leader, feeShares);
            uint256 ppsAfter = (navNow * PPS_SCALE) / (supply + feeShares);
            highWaterMark = ppsAfter;
            if (feeShares > 0) emit FeeCrystallized(feeShares, feeAssets, pps, ppsAfter);
        } else if (!reduceOnly && pps * BPS < hwm * (BPS - drawdownBps)) {
            reduceOnly = true;
            emit MandateBreached(pps, hwm, navNow);
        }
    }

    // ------------------------------------------------------------------ internals
    function _place(address pool, bool isBid, uint256 price, uint256 quantity, uint8 orderType)
        internal
        returns (uint128 orderId)
    {
        bool success;
        (success, orderId) = IPerpPool(pool).placeOrder(
            isBid,
            0,
            price,
            quantity,
            (uint64(block.timestamp) + ORDER_TTL) * 1e9,
            orderType,
            0,
            builder,
            builderFeeBpsTimes1k
        );
        if (!success) revert OrderRejected();
    }

    function _cancelAll(address pool) internal {
        uint128[] memory ids = IPerpPool(pool).getOwnOpenOrders();
        for (uint256 i; i < ids.length; ++i) {
            IPerpPool(pool).cancelOrder(ids[i]);
        }
        emit OrdersCancelled(pool, ids.length, msg.sender);
    }

    function _mark(address pool) internal view returns (uint256 mark) {
        bool ok;
        (ok, mark) = IPerpPool(pool).tryGetMarkPrice();
        if (!ok || mark == 0) revert MarkUnavailable(pool);
    }

    /// An order is reducing when it is opposite to the position and fits in what is still
    /// purely reducing (|position| minus resting opposite-side orders).
    function _isReducing(IPerpPool.ReducingCapacity memory cap, bool isBid, uint256 quantity)
        internal
        pure
        returns (bool)
    {
        if (cap.positionSize == 0) return false;
        bool opposite = cap.positionSize > 0 ? !isBid : isBid;
        return opposite && quantity <= cap.effectiveReducingCapacity;
    }

    /// Worst-case |exposure| × mark on `pool`: max(long if every bid fills, short if every ask fills),
    /// optionally including one extra order.
    function _worstCaseNotional(address pool, bool extraIsBid, uint256 extraQty) internal view returns (uint256) {
        IPerpPool.ReducingCapacity memory cap = IPerpPool(pool).getReducingCapacity(address(this));
        int256 pos = int256(cap.positionSize);
        int256 longExp = pos + int256(cap.pendingBidQuantity + (extraIsBid ? extraQty : 0));
        int256 shortExp = -pos + int256(cap.pendingAskQuantity + (extraIsBid ? 0 : extraQty));
        int256 worst = longExp > shortExp ? longExp : shortExp;
        if (worst <= 0) return 0;
        return (uint256(worst) * _mark(pool)) / oneBaseOf[pool];
    }

    function _requireLeaderShare() internal view {
        uint256 supply = totalSupply();
        uint256 lb = balanceOf(leader);
        // Applies only while someone other than the leader holds more than dust.
        if (supply - lb > DUST_SHARES && lb * BPS < uint256(leaderMinShareBps) * supply) {
            revert LeaderShareTooLow(lb, supply, leaderMinShareBps);
        }
    }

    /// Shares are transferable, but locked shares cannot move and the leader's minimum holds.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 until = lockedUntil[from];
            if (block.timestamp < until) revert SharesLocked(until);
        }
        super._update(from, to, value);
        if (from == leader && to != address(0)) _requireLeaderShare();
    }
}
