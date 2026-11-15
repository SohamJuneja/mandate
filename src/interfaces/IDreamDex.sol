// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal dreamDEX perp interfaces, as verified in docs/INTERFACES.md.

interface IMarginBank {
    struct SystemConfig {
        address marginBank;
        address collateralToken;
        address perpPoolFactory;
        address liquidationEngine;
        address insuranceFund;
        address feeRecipient;
        uint16 maxLeverageLimit;
        bool fullyWired;
    }

    struct AccountState {
        int256 unlockedCollateralBalance;
        uint256 lockedCollateral;
        address[] activePerpPools;
    }

    struct Position {
        int128 size;
        uint128 avgEntryPrice;
        int256 entryFundingIndex;
        uint64 lastUpdatedTimestampNs;
    }

    function getSystemConfig() external view returns (SystemConfig memory);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    /// Free collateral + unrealized PnL at mark − unsettled funding. Excludes locked collateral.
    function tryGetAccountEquity(address account) external view returns (bool ok, int256 equity);
    function getAccountState(address account) external view returns (AccountState memory);
    function getPosition(address account, address perpPool) external view returns (Position memory);
    function getWithdrawableCollateral(address account) external view returns (uint256);
}

interface IPerpPool {
    struct ReducingCapacity {
        int128 positionSize;
        uint256 pendingBidQuantity;
        uint256 pendingAskQuantity;
        uint256 pendingOppositeQuantity;
        uint256 effectiveReducingCapacity;
    }

    struct BookParams {
        uint256 tickSize;
        uint256 minQuantity;
        uint256 lotSize;
    }

    function placeOrder(
        bool isBid,
        uint64 userData,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k
    ) external returns (bool success, uint128 orderId);

    function cancelOrder(uint128 orderId) external;
    function getOwnOpenOrders() external view returns (uint128[] memory);
    function tryGetMarkPrice() external view returns (bool ok, uint256 price);
    function getOneBase() external view returns (uint256);
    function getOrderBookParameters() external view returns (BookParams memory);
    function getReducingCapacity(address account) external view returns (ReducingCapacity memory);
    function approveBuilder(address builder, uint256 maxFeeBpsTimes1k) external;
    function marginBank() external view returns (address);
}
