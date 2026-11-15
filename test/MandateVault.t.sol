// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {MandateGuard, IMandateFactoryView} from "../src/MandateGuard.sol";
import {IMarginBank} from "../src/interfaces/IDreamDex.sol";
import {MockUSD, MockMarginBank, MockPerpPool} from "./mocks/Mocks.sol";

/// Unit tests against behavioural mocks of the MarginBank and PerpPool (deterministic prices).
/// The real protocol is exercised separately in test/MandateFork.t.sol.
contract MandateVaultTest is Test {
    MockUSD usd;
    MockMarginBank bank;
    MockPerpPool btc;
    MockPerpPool eth;
    MockPerpPool sol;
    MandateFactory factory;
    MandateVault vault;

    address leader = makeAddr("leader");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address keeper = makeAddr("keeper");
    address builder = makeAddr("builder");

    uint256 constant BTC_MARK = 64_000e18;
    uint256 constant ETH_MARK = 2_000e18;
    uint8 constant LIMIT = 0;
    uint8 constant IOC = 2;
    uint8 constant POST_ONLY = 3;

    function setUp() public {
        vm.warp(1_800_000_000);
        usd = new MockUSD();
        bank = new MockMarginBank(usd);
        btc = new MockPerpPool(bank, 1e8, BTC_MARK, 1e17, 13_000, 1_000);
        eth = new MockPerpPool(bank, 1e18, ETH_MARK, 1e16, 4e15, 1e14);
        sol = new MockPerpPool(bank, 1e9, 150e18, 1e16, 1e8, 1e7);
        bank.registerPool(address(btc));
        bank.registerPool(address(eth));
        bank.registerPool(address(sol));
        factory = new MandateFactory(IMarginBank(address(bank)));
        vault = MandateVault(factory.createVault(_params("Mandate BTC/ETH Momentum", leader, _mandate())));

        address[5] memory users = [leader, alice, bob, carol, keeper];
        for (uint256 i; i < users.length; ++i) {
            usd.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            usd.approve(address(vault), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------ helpers
    function _mandate() internal view returns (MandateVault.Mandate memory m) {
        m.allowedPools = new address[](2);
        m.allowedPools[0] = address(btc);
        m.allowedPools[1] = address(eth);
        m.maxLeverageX1e2 = 300;
        m.maxNotionalPerPool = 40e18;
        m.drawdownBps = 1500;
        m.perfFeeBps = 1000;
        m.leaderMinShareBps = 500;
        m.lockSeconds = 120;
        m.builder = builder;
        m.builderFeeBpsTimes1k = 1000;
    }

    function _params(string memory name, address lead, MandateVault.Mandate memory m)
        internal
        pure
        returns (MandateFactory.VaultParams memory p)
    {
        p.name = name;
        p.symbol = "mSHARE";
        p.leader = lead;
        p.mandate = m;
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount);
    }

    function _redeem(address who, uint256 shares) internal returns (uint256 assets) {
        vm.prank(who);
        assets = vault.redeem(shares);
    }

    function _trade(MockPerpPool pool, bool isBid, uint256 price, uint256 qty, uint8 t) internal returns (uint128) {
        vm.prank(leader);
        return vault.trade(address(pool), isBid, price, qty, t);
    }

    /// leader 10, alice 15, bob 10 → NAV 35, 35 shares at 1.0.
    function _seed() internal {
        _deposit(leader, 10e18);
        _deposit(alice, 15e18);
        _deposit(bob, 10e18);
    }

    function _pastLock() internal {
        vm.warp(block.timestamp + 121);
    }

    // ------------------------------------------------------------------ factory
    function test_factory_createsAndTracksVaults() public {
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaults()[0], address(vault));
        assertEq(factory.vaultOfLeader(leader), address(vault));
        assertTrue(factory.isVault(address(vault)));
        assertEq(address(factory.collateral()), address(usd), "collateral read from bank config");
        assertEq(address(vault.collateral()), address(usd));
        assertEq(vault.leader(), leader);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.name(), "Mandate BTC/ETH Momentum");

        address lead2 = makeAddr("lead2");
        vm.recordLogs();
        address v2 = factory.createVault(_params("Second", lead2, _mandate()));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == MandateFactory.VaultCreated.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), v2);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), lead2);
                seen = true;
            }
        }
        assertTrue(seen, "VaultCreated emitted");
        address[] memory page = factory.vaultsPage(1, 10);
        assertEq(page.length, 1);
        assertEq(page[0], v2);
        assertEq(factory.vaultsPage(5, 10).length, 0);
    }

    function test_factory_oneVaultPerLeader() public {
        vm.expectRevert(abi.encodeWithSelector(MandateFactory.LeaderAlreadyHasVault.selector, address(vault)));
        factory.createVault(_params("Again", leader, _mandate()));
    }

    function test_factory_invalidParams() public {
        MandateVault.Mandate memory m = _mandate();
        vm.expectRevert(MandateFactory.InvalidParams.selector);
        factory.createVault(_params("X", address(0), m));
        vm.expectRevert(MandateFactory.InvalidParams.selector);
        factory.createVault(_params("", makeAddr("l1"), m));
        m.maxLeverageX1e2 = 1001;
        vm.expectRevert(MandateFactory.InvalidParams.selector);
        factory.createVault(_params("X", makeAddr("l2"), m));
        m = _mandate();
        m.lockSeconds = 31 days;
        vm.expectRevert(MandateFactory.InvalidParams.selector);
        factory.createVault(_params("X", makeAddr("l3"), m));
    }

    function test_constructor_invalidMandate() public {
        address l = makeAddr("lx");
        MandateVault.Mandate memory m;

        m = _mandate();
        m.allowedPools = new address[](0);
        _expectInvalid(l, m);
        m = _mandate();
        m.maxLeverageX1e2 = 0;
        _expectInvalid(l, m);
        m = _mandate();
        m.maxNotionalPerPool = 0;
        _expectInvalid(l, m);
        m = _mandate();
        m.drawdownBps = 0;
        _expectInvalid(l, m);
        m = _mandate();
        m.drawdownBps = 10_000;
        _expectInvalid(l, m);
        m = _mandate();
        m.perfFeeBps = 5_001;
        _expectInvalid(l, m);
        m = _mandate();
        m.leaderMinShareBps = 10_001;
        _expectInvalid(l, m);
        m = _mandate();
        m.builder = address(0); // fee without a builder
        _expectInvalid(l, m);
        m = _mandate();
        m.allowedPools[1] = address(btc); // duplicate
        _expectInvalid(l, m);
        m = _mandate();
        MockMarginBank otherBank = new MockMarginBank(usd);
        m.allowedPools[1] = address(new MockPerpPool(otherBank, 1e8, BTC_MARK, 1e17, 13_000, 1_000)); // other bank
        _expectInvalid(l, m);
    }

    function _expectInvalid(address l, MandateVault.Mandate memory m) internal {
        vm.expectRevert(MandateVault.InvalidMandate.selector);
        factory.createVault(_params("X", l, m));
    }

    function test_constructor_approvesBuilderFeeCapOnEveryPool() public view {
        assertEq(btc.builderApproval(address(vault), builder), 1000);
        assertEq(eth.builderApproval(address(vault), builder), 1000);
        assertEq(sol.builderApproval(address(vault), builder), 0);
        MandateVault.Mandate memory m = vault.mandate();
        assertEq(m.allowedPools.length, 2);
        assertEq(m.maxLeverageX1e2, 300);
        assertEq(m.builder, builder);
        assertEq(vault.allowedPools()[1], address(eth));
    }

    // ------------------------------------------------------------------ share math
    function test_shareMath_threeDepositors() public {
        assertEq(_deposit(leader, 10e18), 10e18, "1:1 when empty");
        assertEq(vault.highWaterMark(), 1e18);
        assertEq(_deposit(alice, 15e18), 15e18);
        assertEq(_deposit(bob, 10e18), 10e18);
        assertEq(vault.nav(), 35e18);
        assertEq(vault.pricePerShare(), 1e18);
        assertEq(int256(bank.unlocked(address(vault))), 35e18, "all collateral in the bank");
        assertEq(usd.balanceOf(address(vault)), 0);

        // +3.2 USDso: long 0.0005 BTC (32 notional) and BTC +10%.
        _trade(btc, true, 64_100e18, 50_000, IOC);
        btc.setMark(70_400e18);
        assertEq(vault.nav(), 38.2e18);

        // A crystallized fee changes supply; then carol enters at the post-fee price.
        vault.checkpoint();
        uint256 supply = vault.totalSupply();
        uint256 pps = vault.pricePerShare();
        uint256 carolShares = _deposit(carol, 10e18);
        assertEq(carolShares, (uint256(10e18) * supply) / 38.2e18, "shares = amount * supply / nav");
        assertApproxEqAbs(vault.pricePerShare(), pps, 1, "a deposit does not move the price");

        // Everyone exits pro rata after the lock: alice and bob got the same return per USDso.
        btc.setMark(70_400e18);
        _pastLock();
        uint256 aOut = _redeem(alice, vault.balanceOf(alice));
        uint256 bOut = _redeem(bob, vault.balanceOf(bob));
        uint256 cOut = _redeem(carol, carolShares);
        assertApproxEqRel(aOut * 10e18, bOut * 15e18, 1e9, "alice and bob earn the same return");
        assertApproxEqAbs(cOut, 10e18, 2, "carol, who entered at the new price, gets her deposit back");
        assertGt(aOut, 15e18, "alice profited");
        assertLt(aOut, (uint256(15e18) * 38.2e18) / 35e18, "but less than gross, the fee was taken");
    }

    function test_previewMatchesExecution() public {
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        btc.setMark(62_000e18);
        uint256 preview = vault.previewDeposit(5e18);
        assertEq(_deposit(carol, 5e18), preview);
        _pastLock();
        uint256 previewOut = vault.previewRedeem(vault.balanceOf(bob));
        assertEq(_redeem(bob, vault.balanceOf(bob)), previewOut);
    }

    function test_redeemPaysFromWalletFirst() public {
        _seed();
        usd.mint(address(vault), 7e18); // a donation sits in the vault wallet
        _pastLock();
        vault.checkpoint(); // the donation is a gain: the fee crystallizes first
        uint256 bankBefore = uint256(bank.unlocked(address(vault)));
        uint256 expected = vault.previewRedeem(5e18);
        uint256 out = _redeem(bob, 5e18);
        assertEq(out, expected);
        assertLt(out, (uint256(5e18) * 42e18) / 35e18, "net of the performance fee");
        assertEq(uint256(bank.unlocked(address(vault))), bankBefore, "no bank withdrawal needed");
        out = _redeem(alice, 15e18);
        assertLt(uint256(bank.unlocked(address(vault))), bankBefore, "then it withdraws the shortfall");
    }

    // ------------------------------------------------------------------ lock
    function test_lock_blocksRedeemAndTransferUntilExpiry() public {
        _seed();
        uint256 until = vault.lockedUntil(alice);
        assertEq(until, block.timestamp + 120);

        vm.warp(until - 1);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.SharesLocked.selector, until));
        _redeem(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.SharesLocked.selector, until));
        vault.transfer(carol, 1e18);

        vm.warp(until);
        assertEq(_redeem(alice, 1e18), 1e18);
        vm.prank(alice);
        assertTrue(vault.transfer(carol, 1e18));
    }

    function test_lock_resetsOnEveryDeposit() public {
        _seed();
        vm.warp(block.timestamp + 100);
        _deposit(alice, 1e18);
        uint256 until = vault.lockedUntil(alice);
        assertEq(until, block.timestamp + 120);
        vm.warp(block.timestamp + 60);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.SharesLocked.selector, until));
        _redeem(alice, 1e18);
    }

    // ------------------------------------------------------------------ first deposit, zero paths
    function test_firstDepositMustBeLeader() public {
        vm.expectRevert(MandateVault.LeaderMustDepositFirst.selector);
        _deposit(alice, 10e18);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.FirstDepositTooSmall.selector, 1e18));
        _deposit(leader, 1e18 - 1);
        _deposit(leader, 1e18);
    }

    function test_zeroAmountAndZeroShares() public {
        vm.expectRevert(MandateVault.ZeroAmount.selector);
        _deposit(leader, 0);
        _seed();
        _pastLock();
        vm.expectRevert(MandateVault.ZeroAmount.selector);
        _redeem(alice, 0);
        vm.expectRevert(MandateVault.ZeroAmount.selector);
        _trade(btc, true, 60_000e18, 0, POST_ONLY);

        // NAV > supply: 1 wei of collateral is worth less than 1 share-wei.
        usd.mint(address(vault), 5e18);
        vault.checkpoint();
        vm.expectRevert(MandateVault.ZeroShares.selector);
        _deposit(carol, 1);

        // NAV < supply: 1 share-wei pays 0 collateral.
        bank.adjust(address(vault), -6e18);
        vm.expectRevert(MandateVault.ZeroAmount.selector);
        _redeem(alice, 1);
    }

    function test_inflationAttackIsUneconomic() public {
        // The leader is the only possible first depositor and must put in ≥ 1 USDso, so a
        // donation-based price inflation has to be ≥ 1e18× the victim's deposit to round it to zero.
        _deposit(leader, 1e18);
        usd.mint(address(vault), 1_000e18); // a 1000 USDso donation
        vault.checkpoint();
        uint256 shares = _deposit(alice, 100e18);
        assertGt(shares, 0);
        _pastLock();
        assertApproxEqRel(vault.previewRedeem(shares), 100e18, 1e12, "victim keeps their deposit");
    }

    // ------------------------------------------------------------------ leader minimum share
    function test_leaderMinShare_onRedeem() public {
        _seed(); // leader 10 / 35
        _pastLock();
        vm.expectRevert(abi.encodeWithSelector(MandateVault.LeaderShareTooLow.selector, 1e18, 26e18, 500));
        _redeem(leader, 9e18); // 1 / 26 = 3.8%
        _redeem(leader, 8e18); // 2 / 27 = 7.4%
        assertEq(vault.balanceOf(leader), 2e18);

        // Once nobody else holds shares, the leader may leave entirely.
        _redeem(alice, 15e18);
        _redeem(bob, 10e18);
        _redeem(leader, 2e18);
        assertEq(vault.totalSupply(), 0);
    }

    function test_leaderMinShare_dustDoesNotTrapLeader() public {
        _deposit(leader, 10e18);
        _deposit(alice, 1e12); // a dust holder (≤ DUST_SHARES)
        _pastLock();
        _redeem(leader, 10e18); // the leader can still leave entirely
        assertEq(vault.balanceOf(leader), 0);
        // But real holdings still bind it.
        _deposit(leader, 10e18);
        _deposit(bob, 10e18);
        _pastLock();
        vm.expectPartialRevert(MandateVault.LeaderShareTooLow.selector);
        _redeem(leader, 10e18);
    }

    function test_leaderMinShare_onDilutingDeposit() public {
        _seed();
        // 10 / (35 + 200) = 4.26% < 5%.
        vm.expectRevert(abi.encodeWithSelector(MandateVault.LeaderShareTooLow.selector, 10e18, 235e18, 500));
        _deposit(carol, 200e18);
        _deposit(carol, 160e18); // 10 / 195 = 5.13%
    }

    function test_leaderMinShare_onTransfer() public {
        _seed();
        _pastLock();
        vm.prank(leader);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.LeaderShareTooLow.selector, 1e18, 35e18, 500));
        vault.transfer(alice, 9e18);
    }

    // ------------------------------------------------------------------ trade checks
    function test_trade_onlyLeader() public {
        _seed();
        vm.prank(alice);
        vm.expectRevert(MandateVault.NotLeader.selector);
        vault.trade(address(btc), true, 60_000e18, 13_000, POST_ONLY);
        vm.prank(alice);
        vm.expectRevert(MandateVault.NotLeader.selector);
        vault.cancel(address(btc), new uint128[](0));
    }

    function test_trade_marketNotAllowed() public {
        _seed();
        vm.expectRevert(MandateVault.MarketNotAllowed.selector);
        _trade(sol, true, 140e18, 1e8, POST_ONLY);
        vm.startPrank(leader);
        vm.expectRevert(MandateVault.MarketNotAllowed.selector);
        vault.cancel(address(sol), new uint128[](0));
        vm.expectRevert(MandateVault.MarketNotAllowed.selector);
        vault.cancelAll(address(sol));
        vm.expectRevert(MandateVault.MarketNotAllowed.selector);
        vault.closePosition(address(sol));
        vm.stopPrank();
    }

    function test_trade_restingOrderPassesAndUsesBuilder() public {
        _seed();
        vm.expectEmit(true, false, false, false, address(vault));
        emit MandateVault.Traded(address(btc), true, 0, 0, 0, 0, false, 0, 0, 0);
        uint128 id = _trade(btc, true, 62_000e18, 13_000, POST_ONLY);
        assertEq(id, 1);
        assertEq(btc.lastBuilder(), builder);
        assertEq(btc.lastBuilderFee(), 1000);
        assertEq(btc.lastExpiry(), uint64(block.timestamp + 1 days) * 1e9);
        assertGt(bank.locked(address(vault)), 0, "margin locked in the bank");
        assertEq(vault.nav(), 35e18, "locked collateral still counts toward NAV");
    }

    function test_trade_notionalCap() public {
        _seed();
        // 0.0007 BTC × 64,000 = 44.8 > 40.
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotionalCapExceeded.selector, 44.8e18, 40e18));
        _trade(btc, true, 60_000e18, 70_000, POST_ONLY);
        // Resting orders count: 32 resting + 9.6 more = 41.6 > 40.
        _trade(btc, true, 60_000e18, 50_000, POST_ONLY);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotionalCapExceeded.selector, 41.6e18, 40e18));
        _trade(btc, true, 60_000e18, 15_000, POST_ONLY);
        // Exactly at the cap is allowed: 0.02 ETH × 2,000 = 40.
        _trade(eth, true, 1_990e18, 2e16, POST_ONLY);
    }

    function test_trade_leverageCap() public {
        MandateVault.Mandate memory m = _mandate();
        m.maxNotionalPerPool = 1_000e18;
        address lead = makeAddr("levLeader");
        MandateVault v = MandateVault(factory.createVault(_params("Lev", lead, m)));
        usd.mint(lead, 10e18);
        vm.startPrank(lead);
        usd.approve(address(v), 10e18);
        v.deposit(10e18);
        // 3x of 10 = 30; 0.0005 BTC = 32.
        vm.expectRevert(abi.encodeWithSelector(MandateVault.LeverageCapExceeded.selector, 32e18, 10e18, 300));
        v.trade(address(btc), true, 60_000e18, 50_000, POST_ONLY);
        // Across pools: 16.64 BTC + 8 ETH = 24.64 fits; a second 8 ETH makes 32.64 > 30.
        v.trade(address(btc), true, 60_000e18, 26_000, POST_ONLY);
        v.trade(address(eth), true, 1_990e18, 4e15, POST_ONLY);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.LeverageCapExceeded.selector, 32.64e18, 10e18, 300));
        v.trade(address(eth), true, 1_990e18, 4e15, POST_ONLY);
        vm.stopPrank();
    }

    function test_trade_worstCaseCountsBothSides() public {
        _seed();
        _trade(btc, true, 64_100e18, 30_000, IOC); // long 19.2
        // An ask for 0.0008 would flip to short 0.0005 (32): allowed, under 40.
        _trade(btc, false, 70_000e18, 80_000, POST_ONLY);
        assertEq(vault.totalNotional(), 32e18);
        // Another 0.0002 ask: worst-case short 0.0007 = 44.8.
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotionalCapExceeded.selector, 44.8e18, 40e18));
        _trade(btc, false, 70_000e18, 20_000, POST_ONLY);
    }

    function test_trade_markUnavailable() public {
        _seed();
        btc.setMarkOk(false);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.MarkUnavailable.selector, address(btc)));
        _trade(btc, true, 60_000e18, 13_000, POST_ONLY);
    }

    function test_trade_orderRejected() public {
        _seed();
        btc.setRejectNext(true);
        vm.expectRevert(MandateVault.OrderRejected.selector);
        _trade(btc, true, 60_000e18, 13_000, POST_ONLY);
    }

    function test_navUnavailable() public {
        _seed();
        bank.setEquityOk(false);
        vm.expectRevert(MandateVault.NavUnavailable.selector);
        vault.nav();
        vm.expectRevert(MandateVault.NavUnavailable.selector);
        _deposit(carol, 1e18);
        _pastLock();
        vm.expectRevert(MandateVault.NavUnavailable.selector);
        _redeem(alice, 1e18);
        vm.expectRevert(MandateVault.NavUnavailable.selector);
        _trade(btc, true, 60_000e18, 13_000, POST_ONLY);
        assertEq(vault.checkpoint(), 0, "checkpoint is a no-op without a NAV");
        (bool ok,) = vault.tryNav();
        assertFalse(ok);
    }

    // ------------------------------------------------------------------ cancel
    function test_cancelAndCancelAll() public {
        _seed();
        uint128 a = _trade(btc, true, 60_000e18, 13_000, POST_ONLY);
        _trade(btc, true, 59_000e18, 13_000, POST_ONLY);
        _trade(eth, false, 2_100e18, 4e15, POST_ONLY);
        uint128[] memory ids = new uint128[](1);
        ids[0] = a;
        vm.prank(leader);
        vault.cancel(address(btc), ids);
        assertEq(btc.openOrderCount(address(vault)), 1);

        vm.prank(alice);
        vm.expectRevert(MandateVault.NotAuthorized.selector);
        vault.cancelAll(address(btc));
        vm.prank(alice);
        vm.expectRevert(MandateVault.NotAuthorized.selector);
        vault.closePosition(address(btc));

        vm.prank(leader);
        vault.cancelAll(address(btc));
        assertEq(btc.openOrderCount(address(vault)), 0);
        assertEq(eth.openOrderCount(address(vault)), 1);
    }

    // ------------------------------------------------------------------ fees
    function test_fee_onlyAboveHighWaterMark() public {
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC); // long 0.0005 BTC at 64,000
        uint256 leaderBefore = vault.balanceOf(leader);

        // Below the high: no fee.
        btc.setMark(63_000e18);
        vault.checkpoint();
        assertEq(vault.balanceOf(leader), leaderBefore);
        assertEq(vault.highWaterMark(), 1e18);

        // +3.2 → NAV 38.2: fee = 10% × 3.2 = 0.32 USDso, paid in shares.
        btc.setMark(70_400e18);
        uint256 expectedFeeShares = (uint256(0.32e18) * 35e18) / (38.2e18 - 0.32e18);
        vm.expectEmit(false, false, false, false, address(vault));
        emit MandateVault.FeeCrystallized(0, 0, 0, 0);
        vault.checkpoint();
        // The contract prices through a rounded pps, so allow a few wei against the closed form.
        assertApproxEqAbs(vault.balanceOf(leader) - leaderBefore, expectedFeeShares, 10);
        expectedFeeShares = vault.balanceOf(leader) - leaderBefore;
        uint256 hwm = vault.highWaterMark();
        assertEq(hwm, vault.pricePerShare(), "the high is reset to the post-fee price");

        // Same price again: nothing more.
        vault.checkpoint();
        assertEq(vault.balanceOf(leader) - leaderBefore, expectedFeeShares);

        // Dip, then recover to just under the old high: still nothing.
        btc.setMark(66_000e18);
        vault.checkpoint();
        btc.setMark(70_300e18);
        vault.checkpoint();
        assertEq(vault.balanceOf(leader) - leaderBefore, expectedFeeShares, "no fee below the old high");
        assertEq(vault.highWaterMark(), hwm);

        // New high: fee only on the increment above the old high.
        btc.setMark(72_000e18);
        uint256 supply = vault.totalSupply();
        uint256 navNow = vault.nav();
        uint256 pps = (navNow * 1e18) / supply;
        uint256 feeAssets = ((pps - hwm) * supply * 1000) / (1e18 * 10_000);
        uint256 more = (feeAssets * supply) / (navNow - feeAssets);
        vault.checkpoint();
        assertEq(vault.balanceOf(leader) - leaderBefore, expectedFeeShares + more);
    }

    function test_fee_crystallizesBeforeDepositAndRedeem() public {
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        btc.setMark(70_400e18);
        uint256 leaderBefore = vault.balanceOf(leader);
        _deposit(carol, 5e18); // triggers the checkpoint first
        assertGt(vault.balanceOf(leader), leaderBefore);
        assertEq(vault.highWaterMark(), vault.pricePerShare());
    }

    // ------------------------------------------------------------------ drawdown → reduce-only
    function test_drawdown_reduceOnly_reducePasses_increaseReverts() public {
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC); // long 32 notional
        _trade(eth, true, 1_900e18, 4e15, POST_ONLY); // a resting bid

        // −17%: loss 5.44 of 35 → pps 0.8446 < 0.85.
        btc.setMark(53_120e18);
        // An increasing trade in the same tx sees the breach and is refused.
        vm.expectRevert(MandateVault.ReduceOnly.selector);
        _trade(btc, true, 53_000e18, 13_000, POST_ONLY);
        assertFalse(vault.reduceOnly(), "the latch only persists through a successful tx");

        vm.expectEmit(false, false, false, false, address(vault));
        emit MandateVault.MandateBreached(0, 0, 0);
        vault.checkpoint();
        assertTrue(vault.reduceOnly());

        vm.expectRevert(MandateVault.ReduceOnly.selector);
        _trade(btc, true, 53_000e18, 13_000, POST_ONLY); // increases the long
        vm.expectRevert(MandateVault.ReduceOnly.selector);
        _trade(eth, true, 1_900e18, 4e15, POST_ONLY); // opens a new market
        vm.expectRevert(MandateVault.ReduceOnly.selector);
        _trade(btc, false, 50_000e18, 60_000, IOC); // sells more than the position: flips short
        vm.expectRevert(MandateVault.ReduceOnly.selector);
        _deposit(carol, 1e18);

        // A sell that only shrinks the long is allowed.
        _trade(btc, false, 50_000e18, 20_000, IOC);
        assertEq(bank.getPosition(address(vault), address(btc)).size, 30_000);

        // Anyone can now de-risk: cancel resting orders and flatten.
        vm.prank(keeper);
        vault.cancelAll(address(eth));
        assertEq(eth.openOrderCount(address(vault)), 0);
        vm.prank(keeper);
        vault.closePosition(address(btc));
        assertEq(bank.getPosition(address(vault), address(btc)).size, 0);
        assertEq(btc.lastOrderType(), IOC);

        // Depositors can still leave.
        _pastLock();
        assertGt(_redeem(alice, 15e18), 0);
    }

    function test_drawdown_notTriggeredInsideBand() public {
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        btc.setMark(56_000e18); // loss 4 → pps 0.8857, inside the 15% band
        vault.checkpoint();
        assertFalse(vault.reduceOnly());
        _trade(btc, true, 56_000e18, 13_000, IOC);
    }

    function test_closePosition_short_and_flat() public {
        _seed();
        vm.prank(leader);
        assertEq(vault.closePosition(address(btc)), 0, "flat: nothing to send");
        _trade(btc, false, 63_000e18, 26_000, IOC);
        vm.prank(leader);
        vault.closePosition(address(btc));
        assertEq(bank.getPosition(address(vault), address(btc)).size, 0);
    }

    // ------------------------------------------------------------------ approvals
    function test_vaultNeverApprovesAnyPool() public {
        vm.recordLogs();
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        _trade(eth, true, 1_900e18, 4e15, POST_ONLY);
        _deposit(carol, 3e18);
        _pastLock();
        _redeem(bob, 5e18);
        vm.prank(leader);
        vault.closePosition(address(btc));
        vm.prank(leader);
        vault.cancelAll(address(eth));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 approvalSig = keccak256("Approval(address,address,uint256)");
        uint256 approvals;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(usd) || logs[i].topics[0] != approvalSig) continue;
            if (address(uint160(uint256(logs[i].topics[1]))) != address(vault)) continue;
            approvals++;
            assertEq(address(uint160(uint256(logs[i].topics[2]))), address(bank), "the only spender is the bank");
        }
        assertGt(approvals, 0);
        assertEq(usd.allowance(address(vault), address(btc)), 0);
        assertEq(usd.allowance(address(vault), address(eth)), 0);
        assertEq(usd.allowance(address(vault), address(bank)), 0, "and no standing allowance to the bank");
    }

    // ------------------------------------------------------------------ redeem with margin locked
    function test_redeem_insufficientFreeMargin_whenMarginLocked() public {
        btc = new MockPerpPool(bank, 1e8, BTC_MARK, 1e17, 13_000, 1_000);
        eth = new MockPerpPool(bank, 1e18, ETH_MARK, 1e16, 4e15, 1e14);
        // High-IM pools so resting orders lock a large slice of the bank balance.
        btc.setImBps(3000);
        eth.setImBps(3000);
        assertEq(btc.imBps(), 3000);
        bank.registerPool(address(btc));
        bank.registerPool(address(eth));
        MandateVault.Mandate memory m = _mandate();
        m.allowedPools[0] = address(btc);
        m.allowedPools[1] = address(eth);
        address lead = makeAddr("lockLeader");
        vault = MandateVault(factory.createVault(_params("Locked", lead, m)));
        leader = lead;
        address[4] memory users = [leader, alice, bob, carol];
        for (uint256 i; i < users.length; ++i) {
            usd.mint(users[i], 100e18);
            vm.prank(users[i]);
            usd.approve(address(vault), type(uint256).max);
        }
        _seed();
        _trade(btc, true, 64_000e18, 50_000, POST_ONLY); // locks 9.6
        _trade(eth, true, 2_000e18, 2e16, POST_ONLY); // locks 12
        assertEq(bank.locked(address(vault)), 21.6e18);
        assertEq(vault.nav(), 35e18);

        _pastLock();
        vm.expectRevert(abi.encodeWithSelector(MandateVault.InsufficientFreeMargin.selector, 15e18, 13.4e18));
        _redeem(alice, 15e18);
        assertEq(_redeem(bob, 10e18), 10e18, "a redeem that fits in free margin works");

        vm.prank(leader);
        vault.cancelAll(address(btc));
        // Still short: the ETH order keeps 12 locked (13 free < 15).
        vm.expectRevert(abi.encodeWithSelector(MandateVault.InsufficientFreeMargin.selector, 15e18, 13e18));
        _redeem(alice, 15e18);
        vm.prank(leader);
        vault.cancelAll(address(eth));
        assertEq(_redeem(alice, 15e18), 15e18, "after cancelling, the margin is free again");
    }

    // ------------------------------------------------------------------ fuzz
    /// Pro-rata fairness under arbitrary deposits and PnL: same-price entrants earn the same return,
    /// total payouts never exceed NAV, and nobody extracts more than their share.
    function testFuzz_shareMath(uint256 l, uint256 a, uint256 b, int256 pnlBps) public {
        l = bound(l, 1e18, 1e24);
        a = bound(a, 1, l * 9);
        b = bound(b, 1, l * 9);
        pnlBps = bound(pnlBps, -1400, 5000); // stay inside the drawdown band
        usd.mint(leader, l);
        usd.mint(alice, a);
        usd.mint(bob, b);
        _deposit(leader, l);
        _deposit(alice, a);
        _deposit(bob, b);
        uint256 navBefore = vault.nav();
        int256 pnl = (int256(navBefore) * pnlBps) / 10_000;
        if (pnl > 0) usd.mint(address(bank), uint256(pnl)); // gains are backed by real tokens in the bank
        bank.adjust(address(vault), pnl);
        uint256 navAfter = vault.nav();

        _pastLock();
        uint256 aOut = vault.balanceOf(alice) == 0 ? 0 : _redeemOrZero(alice);
        uint256 bOut = vault.balanceOf(bob) == 0 ? 0 : _redeemOrZero(bob);
        uint256 lOut = _redeemOrZero(leader);

        assertLe(aOut + bOut + lOut, navAfter, "never pays out more than NAV");
        // Same entry price ⇒ same return per unit deposited (up to rounding).
        if (aOut > 1e12 && bOut > 1e12) assertApproxEqRel(aOut * b, bOut * a, 1e10); // 1 wei rounding / 1e12 = 1e-12
        // A depositor never gets more than their gross share of NAV.
        assertLe(aOut, (a * navAfter) / navBefore + 1);
        assertLe(bOut, (b * navAfter) / navBefore + 1);
    }

    function _redeemOrZero(address who) internal returns (uint256) {
        uint256 s = vault.balanceOf(who);
        if (s == 0 || vault.previewRedeem(s) == 0) return 0;
        return _redeem(who, s);
    }

    /// A deposit at any price can be redeemed for at most what was put in (no free value), and
    /// loses at most rounding dust.
    function testFuzz_depositRoundTrip(uint256 seed, uint256 amount, int256 pnlBps) public {
        seed = bound(seed, 1e18, 1e24);
        amount = bound(amount, 1e6, seed * 9);
        pnlBps = bound(pnlBps, -1400, 5000);
        usd.mint(leader, seed);
        usd.mint(carol, amount);
        _deposit(leader, seed);
        int256 pnl = (int256(seed) * pnlBps) / 10_000;
        if (pnl > 0) usd.mint(address(bank), uint256(pnl));
        bank.adjust(address(vault), pnl);
        vault.checkpoint();
        uint256 shares;
        try this.depositAs(carol, amount) returns (uint256 s) {
            shares = s;
        } catch {
            return; // e.g. ZeroShares for dust at a high price
        }
        _pastLock();
        uint256 out = vault.previewRedeem(shares);
        assertLe(out, amount, "no value extracted by a round trip");
        uint256 pps = vault.pricePerShare();
        assertGe(out + pps / 1e18 + 2, amount, "loses at most rounding dust");
    }

    function depositAs(address who, uint256 amount) external returns (uint256) {
        vm.prank(who);
        return vault.deposit(amount);
    }

    // ------------------------------------------------------------------ reactivity guard
    function _topics(address v) internal pure returns (bytes32[] memory t) {
        t = new bytes32[](3);
        t[0] = keccak256("PositionUpdated(address,address,int128,uint128,int256,int256)");
        t[1] = bytes32(uint256(uint160(v)));
        t[2] = bytes32(0);
    }

    function test_guard_onlyPrecompile() public {
        MandateGuard g = new MandateGuard(IMandateFactoryView(address(factory)));
        vm.expectRevert(MandateGuard.OnlyReactivityPrecompile.selector);
        g.onEvent(address(bank), _topics(address(vault)), "");
        vm.expectRevert(MandateGuard.NotAMandateVault.selector);
        g.poke(address(0xBEEF));
        assertTrue(g.supportsInterface(0x01ffc9a7));
    }

    function test_guard_breachLatchesAndFlattensInOneCall() public {
        MandateGuard g = new MandateGuard(IMandateFactoryView(address(factory)));
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        _trade(eth, true, 1_900e18, 4e15, POST_ONLY);
        btc.setMark(53_120e18); // −17% on the position → pps 0.845 < 0.85
        vm.recordLogs();
        vm.prank(address(0x0100));
        g.onEvent(address(bank), _topics(address(vault)), "");
        assertTrue(vault.reduceOnly(), "latched");
        assertEq(bank.getPosition(address(vault), address(btc)).size, 0, "flattened");
        assertEq(eth.openOrderCount(address(vault)), 0, "resting orders cancelled");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool fired;
        for (uint256 i; i < logs.length; ++i) if (logs[i].topics[0] == MandateGuard.GuardFired.selector) fired = true;
        assertTrue(fired);
    }

    function test_guard_noBreach_noClose_andIgnoresStrangers() public {
        MandateGuard g = new MandateGuard(IMandateFactoryView(address(factory)));
        _seed();
        _trade(btc, true, 64_100e18, 50_000, IOC);
        btc.setMark(63_000e18); // small loss, inside the band
        vm.prank(address(0x0100));
        g.onEvent(address(bank), _topics(address(vault)), "");
        assertFalse(vault.reduceOnly());
        assertEq(bank.getPosition(address(vault), address(btc)).size, 50_000, "untouched");
        // An event for a non-vault account is ignored, not reverted.
        vm.prank(address(0x0100));
        g.onEvent(address(bank), _topics(alice), "");
        // poke(): the off-chain fallback path.
        btc.setMark(53_120e18);
        vm.prank(keeper);
        g.poke(address(vault));
        assertTrue(vault.reduceOnly());
        assertEq(bank.getPosition(address(vault), address(btc)).size, 0);
    }
}
