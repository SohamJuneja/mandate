// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";

interface IERC20P {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

struct AS { int256 unlocked; uint256 locked; address[] pools; }
interface IBankP {
    function getAccountEquity(address) external view returns (int256);
    function deposit(uint256) external;
    function getAccountState(address) external view returns (AS memory);
}

interface IPoolP {
    function tryGetMarkPrice() external view returns (bool, uint256);
    function getOwnOpenOrders() external view returns (uint128[] memory);
}

contract Holder {
    function go(address usd, address bank, uint256 amt) external {
        IERC20P(usd).approve(bank, amt);
        IBankP(bank).deposit(amt);
    }

    function call(address target, bytes calldata data) external returns (bool ok, bytes memory ret) {
        (ok, ret) = target.call(data);
    }

    function own(address pool) external view returns (uint128[] memory) {
        return IPoolP(pool).getOwnOpenOrders();
    }
}

/// Probe: does a Foundry fork of Hideki execute the real protocol, and what does placeOrder return?
contract ForkProbe is Test {
    address constant USD = 0xed7993A74dAe1e6656B704A424DcD8711aAf4F72;
    address constant BANK = 0x478769E1177C0773c43A593DCCc4Ad15F15F1394;
    address constant BTC = 0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0;

    function test_probe() public {
        vm.createSelectFork("hideki");
        console2.log("chainid", block.chainid);
        (, uint256 mark) = IPoolP(BTC).tryGetMarkPrice();
        Holder h = new Holder();
        deal(USD, address(h), 10e18);
        console2.log("dealt", IERC20P(USD).balanceOf(address(h)));
        h.go(USD, BANK, 10e18);
        int256 unl = IBankP(BANK).getAccountState(address(h)).unlocked;
        console2.log("bank unlocked", unl);

        uint256 price = (mark * 97 / 100) / 1e17 * 1e17;
        bytes memory data = abi.encodeWithSignature(
            "placeOrder(bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)",
            true, uint64(0), price, uint256(13000), uint64((block.timestamp + 3600) * 1e9), uint8(3), uint8(0), address(0), uint96(0)
        );
        (bool ok, bytes memory ret) = h.call(BTC, data);
        console2.log("placeOrder ok", ok);
        console2.log("ret length", ret.length);
        console2.logBytes(ret);
        uint128[] memory ids = h.own(BTC);
        console2.log("own open orders", ids.length);
        if (ids.length > 0) console2.log("id0", uint256(ids[0]));
        uint256 locked = IBankP(BANK).getAccountState(address(h)).locked;
        console2.log("locked", locked);

        // IOC buy crossing the ask
        bytes memory ioc = abi.encodeWithSignature(
            "placeOrder(bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)",
            true, uint64(0), (mark * 103 / 100) / 1e17 * 1e17, uint256(13000), uint64((block.timestamp + 3600) * 1e9), uint8(2), uint8(0), address(0), uint96(0)
        );
        (ok, ret) = h.call(BTC, ioc);
        console2.log("IOC ok", ok);
        console2.logBytes(ret);
    }
}
