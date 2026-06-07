// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface that PrivaJetWallet uses to interact with ShieldedPool.
interface IShieldedPool {
    /// @notice Deposit `amount` tokens and register `commitment` in the note set.
    function deposit(uint256 amount, bytes32 commitment) external;

    /// @notice Withdraw `amount` tokens by presenting a valid ZK proof.
    function withdraw(
        uint256 amount,
        bytes calldata proof,
        bytes32 nullifier,
        bytes32 root
    ) external;
}
