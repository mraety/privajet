// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPrivaJetGovernance} from "./interfaces/IPrivaJetGovernance.sol";

/// @title Governed
/// @notice Base for protocol contracts whose privileged calls are gated by
///         {PrivaJetGovernance}.
/// @dev The governance address is fixed at deployment; the authority behind it
///      is resolved on every call. That is what lets the DAO address be set
///      later without redeploying or re-owning anything here.
///
///      For contracts behind a proxy, store the governance address in an
///      initializer instead of using this constructor — `immutable` values live
///      in the implementation's bytecode, not in proxy storage.
abstract contract Governed {
    /// @notice Governance root for this contract.
    IPrivaJetGovernance public immutable governance;

    error ZeroAddress();
    error NotGovernance(address caller);

    constructor(address governance_) {
        if (governance_ == address(0)) revert ZeroAddress();
        governance = IPrivaJetGovernance(governance_);
    }

    /// @dev Restricts a call to whoever currently governs the protocol: the
    ///      guardian multisig before the DAO exists, the DAO afterwards.
    modifier onlyGovernance() {
        if (msg.sender != governance.authority()) revert NotGovernance(msg.sender);
        _;
    }
}
