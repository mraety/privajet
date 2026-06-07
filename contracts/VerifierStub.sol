// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPrivacyVerifier.sol";

/**
 * @title VerifierStub
 * @notice Placeholder ZK verifier that unconditionally rejects all proofs.
 *         Deployed alongside ShieldedPool at launch so that withdrawals are
 *         disabled until the real Groth16/PLONK verifier ships in V3.
 *         Replaced via ShieldedPool.setVerifier() — multisig only.
 */
contract VerifierStub is IPrivacyVerifier {
    function verifyProof(
        bytes calldata,
        bytes32,
        bytes32,
        uint256
    ) external pure override returns (bool) {
        return false;
    }
}
