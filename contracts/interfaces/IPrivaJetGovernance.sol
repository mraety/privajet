// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPrivaJetGovernance
/// @notice Minimal surface other PrivaJet contracts use to resolve who is
///         currently allowed to govern the protocol.
/// @dev Protocol contracts should point at the governance contract once, at
///      deployment, and read `authority()` on every privileged call. The DAO
///      address can then be plugged in later without touching them again.
interface IPrivaJetGovernance {
    /// @notice The address currently allowed to govern the protocol.
    /// @return The DAO once it has accepted the handover, otherwise the guardian.
    function authority() external view returns (address);

    /// @notice True when `account` is the current authority.
    function isGovernor(address account) external view returns (bool);

    /// @notice The DAO address, or `address(0)` while the DAO does not exist yet.
    function dao() external view returns (address);

    /// @notice The bootstrap multisig, or `address(0)` after it renounced.
    function guardian() external view returns (address);
}
