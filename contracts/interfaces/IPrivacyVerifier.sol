// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for a ZK proof verifier used by ShieldedPool.
///         V1 is served by VerifierStub (always false).
///         V3 will replace it with a real Groth16/PLONK verifier.
interface IPrivacyVerifier {
    /// @param proof   Serialised ZK proof bytes
    /// @param nullifier  Unique nullifier for this note (prevents double-spend)
    /// @param root       Merkle root the proof is pinned to
    /// @param amount     Claimed withdrawal amount
    function verifyProof(
        bytes calldata proof,
        bytes32 nullifier,
        bytes32 root,
        uint256 amount
    ) external view returns (bool);
}
