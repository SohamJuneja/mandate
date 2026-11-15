// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MandateVault} from "./MandateVault.sol";
import {IMarginBank} from "./interfaces/IDreamDex.sol";

/// @title MandateFactory
/// @notice Deploys MandateVaults against one MarginBank. One vault per leader. Collateral is
///         read from the bank's live system config, never hardcoded.
contract MandateFactory {
    struct VaultParams {
        string name;
        string symbol;
        address leader;
        MandateVault.Mandate mandate;
    }

    /// Sanity bounds on what any vault may be configured with.
    uint256 public constant MAX_LEVERAGE_X1E2 = 1_000; // 10x
    uint32 public constant MAX_LOCK_SECONDS = 30 days;

    IMarginBank public immutable marginBank;
    IERC20 public immutable collateral;

    address[] private _vaults;
    mapping(address leader => address vault) public vaultOfLeader;
    mapping(address vault => bool) public isVault;

    event VaultCreated(
        address indexed vault,
        address indexed leader,
        string name,
        address[] allowedPools,
        uint256 maxLeverageX1e2,
        uint256 maxNotionalPerPool,
        uint16 drawdownBps,
        uint32 lockSeconds
    );

    error LeaderAlreadyHasVault(address vault);
    error InvalidParams();

    constructor(IMarginBank marginBank_) {
        marginBank = marginBank_;
        IMarginBank.SystemConfig memory cfg = marginBank_.getSystemConfig();
        if (cfg.collateralToken == address(0)) revert InvalidParams();
        collateral = IERC20(cfg.collateralToken);
    }

    function createVault(VaultParams calldata p) external returns (address vault) {
        if (p.leader == address(0) || bytes(p.name).length == 0) revert InvalidParams();
        if (p.mandate.maxLeverageX1e2 > MAX_LEVERAGE_X1E2 || p.mandate.lockSeconds > MAX_LOCK_SECONDS) {
            revert InvalidParams();
        }
        address existing = vaultOfLeader[p.leader];
        if (existing != address(0)) revert LeaderAlreadyHasVault(existing);

        vault = address(new MandateVault(p.name, p.symbol, collateral, marginBank, p.leader, p.mandate));
        _vaults.push(vault);
        vaultOfLeader[p.leader] = vault;
        isVault[vault] = true;
        emit VaultCreated(
            vault,
            p.leader,
            p.name,
            p.mandate.allowedPools,
            p.mandate.maxLeverageX1e2,
            p.mandate.maxNotionalPerPool,
            p.mandate.drawdownBps,
            p.mandate.lockSeconds
        );
    }

    function vaults() external view returns (address[] memory) {
        return _vaults;
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    /// Paged read for frontends: vaults[offset : offset+limit].
    function vaultsPage(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = _vaults.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _vaults[i];
        }
    }
}
