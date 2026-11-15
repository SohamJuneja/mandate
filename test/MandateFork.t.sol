// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {IMarginBank, IPerpPool} from "../src/interfaces/IDreamDex.sol";

/// Integration tests against the REAL dreamDEX contracts on a Foundry fork of Hideki (chain 50383),
/// pinned to one block so the RPC cache makes reruns fast.
///   forge test --match-contract MandateFork
contract MandateForkTest is Test {
    uint256 constant FORK_BLOCK = 50_487_900;
    IMarginBank constant BANK = IMarginBank(0x478769E1177C0773c43A593DCCc4Ad15F15F1394);
    IERC20 constant USD = IERC20(0xed7993A74dAe1e6656B704A424DcD8711aAf4F72);
    IPerpPool constant BTC = IPerpPool(0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0);
    IPerpPool constant ETH = IPerpPool(0xD6Cb1DD58580B84D76068aC21594219ce03aeddf);
    IPerpPool constant SOL = IPerpPool(0xB483ec1fb34996638677c20ab087b16F1896FA53);

    MandateFactory factory;
    MandateVault vault;
    address leader = makeAddr("leader");
    address alice = makeAddr("alice");
    address builder = makeAddr("builder");

    function setUp() public {
        vm.createSelectFork("hideki", FORK_BLOCK);
        assertEq(block.chainid, 50383);
        factory = new MandateFactory(BANK);
        assertEq(address(factory.collateral()), address(USD), "collateral read live from getSystemConfig");

        MandateVault.Mandate memory m;
        m.allowedPools = new address[](2);
        m.allowedPools[0] = address(BTC);
        m.allowedPools[1] = address(ETH);
        m.maxLeverageX1e2 = 300;
        m.maxNotionalPerPool = 30e18;
        m.drawdownBps = 1500;
        m.perfFeeBps = 1000;
        m.leaderMinShareBps = 500;
        m.lockSeconds = 120;
        m.builder = builder;
        m.builderFeeBpsTimes1k = 1000; // 1 bp, under the pool's 10 bp ceiling
        MandateFactory.VaultParams memory p;
        p.name = "Fork Vault";
        p.symbol = "mFORK";
        p.leader = leader;
        p.mandate = m;
        vault = MandateVault(factory.createVault(p));

        deal(address(USD), leader, 100e18);
        deal(address(USD), alice, 100e18);
        vm.prank(leader);
        USD.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        USD.approve(address(vault), type(uint256).max);
    }

    function _mark(IPerpPool pool) internal view returns (uint256 m) {
        bool ok;
        (ok, m) = pool.tryGetMarkPrice();
        assertTrue(ok, "mark live at the fork block");
    }

    function _tick(IPerpPool pool, uint256 price, bool up) internal view returns (uint256) {
        uint256 t = pool.getOrderBookParameters().tickSize;
        return up ? ((price + t - 1) / t) * t : (price / t) * t;
    }

    /// Deposit → real bank; resting order as owner; every mandate revert against real pools;
    /// cancelAll; builder fee-cap approval; no pool allowance.
    function test_fork_fullLifecycle() public {
        vm.prank(leader);
        vault.deposit(10e18);
        vm.prank(alice);
        vault.deposit(15e18);
        IMarginBank.AccountState memory st = BANK.getAccountState(address(vault));
        assertEq(st.unlockedCollateralBalance, 25e18, "collateral sits in the vault's own bank account");
        assertEq(USD.balanceOf(address(vault)), 0);
        assertEq(vault.nav(), 25e18);
        assertEq(USD.allowance(address(vault), address(BANK)), 0, "deposit approval fully consumed");

        // Builder fee-cap approval on the real pools.
        assertEq(uint256(BTCB().getEffectiveBuilderApproval(address(vault), builder)), 1000);

        // Resting PostOnly bid, min size, 3% under mark.
        uint256 mark = _mark(BTC);
        uint256 minQty = BTC.getOrderBookParameters().minQuantity;
        uint256 price = _tick(BTC, (mark * 97) / 100, false);
        vm.prank(leader);
        uint128 id = vault.trade(address(BTC), true, price, minQty, 3);
        assertGt(id, 0, "real pool returned an order id");
        vm.prank(address(vault));
        uint128[] memory own = BTC.getOwnOpenOrders();
        assertEq(own.length, 1);
        assertEq(own[0], id);
        st = BANK.getAccountState(address(vault));
        assertGt(st.lockedCollateral, 0, "margin locked in the bank, not pulled from the wallet");
        assertApproxEqAbs(vault.nav(), 25e18, 1e12, "locked collateral still counts in NAV");

        // MarketNotAllowed on a real pool outside the allowlist.
        vm.prank(leader);
        vm.expectRevert(MandateVault.MarketNotAllowed.selector);
        vault.trade(address(SOL), true, 1e18, 1e8, 3);

        // NotionalCapExceeded: 0.0005 BTC ≈ 32 > 30.
        vm.prank(leader);
        vm.expectPartialRevert(MandateVault.NotionalCapExceeded.selector);
        vault.trade(address(BTC), true, price, 50_000, 3);

        // LeverageCapExceeded: 3 × 25 = 75. BTC ≈ 8.3 resting + ETH 0.04 × ~1,770 ≈ 70 + … → over.
        uint256 ethMark = _mark(ETH);
        uint256 ethPrice = _tick(ETH, (ethMark * 97) / 100, false);
        vm.prank(leader);
        vm.expectPartialRevert(MandateVault.NotionalCapExceeded.selector); // ETH alone ≈ 70 > 30 per-pool cap
        vault.trade(address(ETH), true, ethPrice, 4e16, 3);

        // cancelAll by the leader; a stranger cannot while the mandate holds.
        vm.prank(alice);
        vm.expectRevert(MandateVault.NotAuthorized.selector);
        vault.cancelAll(address(BTC));
        vm.prank(leader);
        vault.cancelAll(address(BTC));
        vm.prank(address(vault));
        assertEq(BTC.getOwnOpenOrders().length, 0);
        assertEq(BANK.getAccountState(address(vault)).lockedCollateral, 0);

        assertEq(USD.allowance(address(vault), address(BTC)), 0, "never approves a pool");
        assertEq(USD.allowance(address(vault), address(ETH)), 0, "never approves a pool");

        // Redeem after the lock, paid from the real bank.
        vm.warp(block.timestamp + 121);
        uint256 before = USD.balanceOf(alice);
        vm.prank(alice);
        uint256 out = vault.redeem(15e18);
        assertApproxEqAbs(out, 15e18, 1e12);
        assertEq(USD.balanceOf(alice) - before, out);
    }

    /// A marketable IOC opens a real position on the BTC book; closePosition flattens it.
    function test_fork_iocOpenThenClose() public {
        vm.prank(leader);
        vault.deposit(20e18);
        uint256 mark = _mark(BTC);
        uint256 minQty = BTC.getOrderBookParameters().minQuantity;
        uint256 price = _tick(BTC, (mark * 103) / 100, true); // before the prank: it makes an external call
        vm.prank(leader);
        vault.trade(address(BTC), true, price, minQty, 2);
        IMarginBank.Position memory p = BANK.getPosition(address(vault), address(BTC));
        console2.log("position size", int256(p.size));
        console2.log("entry", uint256(p.avgEntryPrice));
        assertEq(int256(p.size), int256(minQty), "long min size");
        uint256 navOpen = vault.nav();
        console2.log("nav after open", navOpen);
        assertGt(navOpen, 19.9e18, "only fees and spread lost");
        assertLe(vault.totalNotional() * 100, 300 * navOpen);

        vm.prank(leader);
        vault.closePosition(address(BTC));
        assertEq(BANK.getPosition(address(vault), address(BTC)).size, 0, "flat");
        console2.log("nav after close", vault.nav());
    }

    function BTCB() internal pure returns (IBuilderView) {
        return IBuilderView(address(BTC));
    }
}

interface IBuilderView {
    function getEffectiveBuilderApproval(address user, address builder) external view returns (uint256);
}
