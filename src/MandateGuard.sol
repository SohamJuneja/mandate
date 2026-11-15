// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal mirror of the somnia-chain reactivity-contracts 0.2.1 handler interface (that package pins solc 0.8.30).
interface ISomniaEventHandler {
    function onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) external;
}

interface IMandateFactoryView {
    function isVault(address vault) external view returns (bool);
}

interface IMandateVaultGuarded {
    function checkpoint() external returns (uint256);
    function reduceOnly() external view returns (bool);
    function allowedPools() external view returns (address[] memory);
    function closePosition(address pool) external returns (uint128);
    function pricePerShare() external view returns (uint256);
    function highWaterMark() external view returns (uint256);
}

/// @title MandateGuard
/// @notice Somnia Reactivity safety switch. Subscribed to MarginBank.PositionUpdated filtered on a
///         vault's address (topic1). In the same block as any fill on that vault, it runs the vault's
///         checkpoint(). If that latches reduce-only (drawdown breach), it flattens every allowed market.
///         It holds no funds and has no privileges: checkpoint() is public, and closePosition() is
///         open to anyone once a vault is breached.
contract MandateGuard is ISomniaEventHandler {
    address public constant REACTIVITY_PRECOMPILE = address(0x0100);
    IMandateFactoryView public immutable factory;

    event GuardFired(address indexed vault, bool reduceOnly, uint256 pricePerShare, uint256 highWaterMark, uint256 closed, bool viaReactivity);
    event GuardStepFailed(address indexed vault, address pool, bytes reason);

    error OnlyReactivityPrecompile();
    error NotAMandateVault();

    constructor(IMandateFactoryView factory_) {
        factory = factory_;
    }

    /// Reactivity callback: `eventTopics[1]` is PositionUpdated's indexed `account`.
    function onEvent(address, bytes32[] calldata eventTopics, bytes calldata) external {
        if (msg.sender != REACTIVITY_PRECOMPILE) revert OnlyReactivityPrecompile();
        if (eventTopics.length < 2) return;
        address vault = address(uint160(uint256(eventTopics[1])));
        // Never revert in a reactive call: an ignored event is better than a wasted invocation.
        if (!factory.isVault(vault)) return;
        _guard(vault, true);
    }

    /// The same logic for an off-chain keeper (or anyone) as a fallback.
    function poke(address vault) external {
        if (!factory.isVault(vault)) revert NotAMandateVault();
        _guard(vault, false);
    }

    function _guard(address vault, bool viaReactivity) internal {
        IMandateVaultGuarded v = IMandateVaultGuarded(vault);
        try v.checkpoint() {} catch (bytes memory reason) {
            emit GuardStepFailed(vault, address(0), reason);
        }
        bool ro = v.reduceOnly();
        uint256 closed;
        if (ro) {
            address[] memory pools = v.allowedPools();
            for (uint256 i; i < pools.length; ++i) {
                try v.closePosition(pools[i]) returns (uint128 id) {
                    if (id != 0) closed++;
                } catch (bytes memory reason) {
                    emit GuardStepFailed(vault, pools[i], reason);
                }
            }
        }
        uint256 pps;
        try v.pricePerShare() returns (uint256 p) {
            pps = p;
        } catch {}
        emit GuardFired(vault, ro, pps, v.highWaterMark(), closed, viaReactivity);
    }

    /// ERC-165, so the precompile can recognise the handler.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == type(ISomniaEventHandler).interfaceId;
    }
}
