// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMarginBank, IPerpPool} from "../../src/interfaces/IDreamDex.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("USDso", "USDso") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Behavioural model of the dreamDEX MarginBank: cross-margin collateral, positions marked to the
/// pool's mark price, collateral locked behind resting orders, free-margin withdrawals.
contract MockMarginBank {
    IERC20 public immutable token;
    mapping(address => int256) public unlocked;
    mapping(address => uint256) public locked;
    mapping(address => mapping(address => IMarginBank.Position)) internal _pos;
    mapping(address => address[]) internal _active;
    mapping(address => mapping(address => bool)) internal _isActive;
    mapping(address => bool) public isPool;
    bool public equityOk = true;

    error InsufficientMargin();
    error OnlyPool();

    constructor(IERC20 token_) {
        token = token_;
    }

    function registerPool(address pool) external {
        isPool[pool] = true;
    }

    function setEquityOk(bool ok) external {
        equityOk = ok;
    }

    /// Test hook: move collateral in or out of an account (e.g. funding, fees).
    function adjust(address account, int256 delta) external {
        unlocked[account] += delta;
    }

    function getSystemConfig() external view returns (IMarginBank.SystemConfig memory c) {
        c.marginBank = address(this);
        c.collateralToken = address(token);
        c.fullyWired = true;
    }

    function deposit(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        unlocked[msg.sender] += int256(amount);
    }

    function withdraw(uint256 amount) external {
        if (amount > getWithdrawableCollateral(msg.sender)) revert InsufficientMargin();
        unlocked[msg.sender] -= int256(amount);
        token.transfer(msg.sender, amount);
    }

    function _upnl(address account) internal view returns (int256 total, uint256 im) {
        address[] memory pools = _active[account];
        for (uint256 i; i < pools.length; ++i) {
            IMarginBank.Position memory p = _pos[account][pools[i]];
            if (p.size == 0) continue;
            MockPerpPool pool = MockPerpPool(pools[i]);
            int256 mark = int256(pool.mark());
            total += (int256(p.size) * (mark - int256(uint256(p.avgEntryPrice)))) / int256(pool.oneBase());
            uint256 absSize = uint256(int256(p.size < 0 ? -p.size : p.size));
            im += (absSize * uint256(mark) / pool.oneBase()) * pool.imBps() / 10_000;
        }
    }

    function tryGetAccountEquity(address account) external view returns (bool, int256) {
        if (!equityOk) return (false, 0);
        (int256 u,) = _upnl(account);
        return (true, unlocked[account] + u);
    }

    function getAccountState(address account) external view returns (IMarginBank.AccountState memory s) {
        s.unlockedCollateralBalance = unlocked[account];
        s.lockedCollateral = locked[account];
        s.activePerpPools = _active[account];
    }

    function getPosition(address account, address pool) external view returns (IMarginBank.Position memory) {
        return _pos[account][pool];
    }

    function getWithdrawableCollateral(address account) public view returns (uint256) {
        (int256 u, uint256 im) = _upnl(account);
        int256 free = unlocked[account] + u - int256(im);
        int256 w = unlocked[account] < free ? unlocked[account] : free;
        return w > 0 ? uint256(w) : 0;
    }

    // --- pool hooks
    modifier onlyPool() {
        if (!isPool[msg.sender]) revert OnlyPool();
        _;
    }

    function lock(address account, uint256 amount) external onlyPool {
        if (unlocked[account] < int256(amount)) revert InsufficientMargin();
        unlocked[account] -= int256(amount);
        locked[account] += amount;
    }

    function unlock(address account, uint256 amount) external onlyPool {
        locked[account] -= amount;
        unlocked[account] += int256(amount);
    }

    function applyFill(address account, int256 dq, uint256 price) external onlyPool {
        address pool = msg.sender;
        if (!_isActive[account][pool]) {
            _isActive[account][pool] = true;
            _active[account].push(pool);
        }
        IMarginBank.Position storage p = _pos[account][pool];
        int256 size = int256(p.size);
        int256 next = size + dq;
        uint256 oneBase = MockPerpPool(pool).oneBase();
        if (size == 0 || (size > 0) == (dq > 0)) {
            uint256 a = uint256(size < 0 ? -size : size);
            uint256 b = uint256(dq < 0 ? -dq : dq);
            p.avgEntryPrice = uint128((a * p.avgEntryPrice + b * price) / (a + b));
        } else {
            uint256 absSize = uint256(size < 0 ? -size : size);
            uint256 absDq = uint256(dq < 0 ? -dq : dq);
            uint256 closing = absDq < absSize ? absDq : absSize;
            int256 dir = size > 0 ? int256(1) : int256(-1);
            int256 realized = (int256(closing) * (int256(price) - int256(uint256(p.avgEntryPrice))) * dir) / int256(oneBase);
            unlocked[account] += realized;
            if (next == 0) p.avgEntryPrice = 0;
            else if ((next > 0) != (size > 0)) p.avgEntryPrice = uint128(price);
        }
        p.size = int128(next);
    }
}

/// Behavioural model of a dreamDEX PerpPool order book (owner path only).
contract MockPerpPool {
    struct Order {
        address owner;
        bool isBid;
        uint256 price;
        uint256 qty;
        uint256 lockedAmt;
    }

    MockMarginBank public immutable bank;
    uint256 public mark;
    bool public markOk = true;
    uint256 public immutable oneBase;
    uint256 public tickSize;
    uint256 public minQuantity;
    uint256 public lotSize;
    uint256 public imBps = 250;
    bool public rejectNext;

    uint128 public nextId = 1;
    mapping(uint128 => Order) public orders;
    mapping(address => uint128[]) internal _own;
    mapping(address => mapping(address => uint256)) public builderApproval;

    // Last order, for assertions.
    address public lastBuilder;
    uint96 public lastBuilderFee;
    uint8 public lastOrderType;
    uint64 public lastExpiry;

    error IncorrectOrder();
    error InvalidQuantity();
    error InvalidPrice();
    error BuilderFeeExceedsApproval();

    constructor(MockMarginBank bank_, uint256 oneBase_, uint256 mark_, uint256 tick_, uint256 minQty_, uint256 lot_) {
        bank = bank_;
        oneBase = oneBase_;
        mark = mark_;
        tickSize = tick_;
        minQuantity = minQty_;
        lotSize = lot_;
    }

    function setMark(uint256 m) external {
        mark = m;
    }

    function setMarkOk(bool ok) external {
        markOk = ok;
    }

    function setImBps(uint256 b) external {
        imBps = b;
    }

    function setRejectNext(bool r) external {
        rejectNext = r;
    }

    function marginBank() external view returns (address) {
        return address(bank);
    }

    function getOneBase() external view returns (uint256) {
        return oneBase;
    }

    function tryGetMarkPrice() external view returns (bool, uint256) {
        return (markOk, mark);
    }

    function getOrderBookParameters() external view returns (IPerpPool.BookParams memory) {
        return IPerpPool.BookParams(tickSize, minQuantity, lotSize);
    }

    function approveBuilder(address builder, uint256 maxFee) external {
        builderApproval[msg.sender][builder] = maxFee;
    }

    function placeOrder(
        bool isBid,
        uint64,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8,
        address builder,
        uint96 builderFee
    ) external returns (bool, uint128) {
        if (quantity < minQuantity || quantity % lotSize != 0) revert InvalidQuantity();
        if (price == 0 || price % tickSize != 0) revert InvalidPrice();
        if (builderFee > builderApproval[msg.sender][builder]) revert BuilderFeeExceedsApproval();
        lastBuilder = builder;
        lastBuilderFee = builderFee;
        lastOrderType = orderType;
        lastExpiry = expireTimestampNs;
        if (rejectNext) {
            rejectNext = false;
            return (false, 0);
        }
        uint128 id = nextId++;
        if (orderType == 1 || orderType == 2) {
            // Marketable: fill in full at mark.
            bank.applyFill(msg.sender, isBid ? int256(quantity) : -int256(quantity), mark);
            return (true, id);
        }
        uint256 lockAmt = ((quantity * price) / oneBase) * imBps / 10_000;
        bank.lock(msg.sender, lockAmt);
        orders[id] = Order(msg.sender, isBid, price, quantity, lockAmt);
        _own[msg.sender].push(id);
        return (true, id);
    }

    /// Test hook: fill a resting order at its price.
    function fill(uint128 id) external {
        Order memory o = orders[id];
        if (o.owner == address(0)) revert IncorrectOrder();
        bank.unlock(o.owner, o.lockedAmt);
        bank.applyFill(o.owner, o.isBid ? int256(o.qty) : -int256(o.qty), o.price);
        _remove(o.owner, id);
        delete orders[id];
    }

    function cancelOrder(uint128 id) external {
        Order memory o = orders[id];
        if (o.owner != msg.sender) revert IncorrectOrder();
        bank.unlock(o.owner, o.lockedAmt);
        _remove(o.owner, id);
        delete orders[id];
    }

    function _remove(address owner, uint128 id) internal {
        uint128[] storage list = _own[owner];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == id) {
                list[i] = list[list.length - 1];
                list.pop();
                return;
            }
        }
    }

    function getOwnOpenOrders() external view returns (uint128[] memory) {
        return _own[msg.sender];
    }

    function openOrderCount(address owner) external view returns (uint256) {
        return _own[owner].length;
    }

    function getReducingCapacity(address account) external view returns (IPerpPool.ReducingCapacity memory c) {
        c.positionSize = bank.getPosition(account, address(this)).size;
        uint128[] memory ids = _own[account];
        for (uint256 i; i < ids.length; ++i) {
            Order memory o = orders[ids[i]];
            if (o.isBid) c.pendingBidQuantity += o.qty;
            else c.pendingAskQuantity += o.qty;
        }
        uint256 absPos = uint256(int256(c.positionSize < 0 ? -c.positionSize : c.positionSize));
        c.pendingOppositeQuantity = c.positionSize > 0 ? c.pendingAskQuantity : c.positionSize < 0 ? c.pendingBidQuantity : 0;
        c.effectiveReducingCapacity = absPos > c.pendingOppositeQuantity ? absPos - c.pendingOppositeQuantity : 0;
    }
}
