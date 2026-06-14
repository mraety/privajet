// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IPrivacyVerifier.sol";
import "./interfaces/IShieldedPool.sol";

/**
 * @title ShieldedPool
 * @notice Privacy pool for PRIVA using a commitment/nullifier scheme.
 *
 *  Deposit flow  — anyone can deposit; the commitment is recorded on-chain.
 *  Withdraw flow — callers must supply a valid ZK proof.  With VerifierStub this
 *                  always fails; once the real verifier is installed via setVerifier
 *                  (multisig), withdrawals become live.
 *
 * V1 uses a simple commitment registry (no Merkle tree). V2 will add an
 * incremental Merkle tree and batch-proof support.
 */
contract ShieldedPool is IShieldedPool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IPrivacyVerifier public verifier;

    // commitment => deposited amount (zero means unused)
    mapping(bytes32 => uint256) public commitments;
    // nullifier => spent
    mapping(bytes32 => bool) public nullifierUsed;
    // Roots accepted for withdrawal proofs (populated on deposit)
    mapping(bytes32 => bool) public knownRoots;

    uint256 public totalShielded;

    event Deposited(bytes32 indexed commitment, uint256 amount);
    event Withdrawn(bytes32 indexed nullifier, address indexed recipient, uint256 amount);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    constructor(address _token, address _verifier) {
        require(_token != address(0), "Token: zero address");
        require(_verifier != address(0), "Verifier: zero address");
        token = IERC20(_token);
        verifier = IPrivacyVerifier(_verifier);
    }

    // ───────── IShieldedPool ─────────

    function deposit(uint256 amount, bytes32 commitment) external override nonReentrant {
        require(amount > 0, "Amount: zero");
        require(commitment != bytes32(0), "Commitment: zero");
        require(commitments[commitment] == 0, "Commitment: already registered");

        token.safeTransferFrom(msg.sender, address(this), amount);
        commitments[commitment] = amount;
        totalShielded += amount;

        // V1 root: hash of (commitment, amount). V2 will use an incremental Merkle tree.
        bytes32 root = keccak256(abi.encodePacked(commitment, amount));
        knownRoots[root] = true;

        emit Deposited(commitment, amount);
    }

    function withdraw(
        uint256 amount,
        bytes calldata proof,
        bytes32 nullifier,
        bytes32 root
    ) external override nonReentrant {
        require(amount > 0, "Amount: zero");
        require(knownRoots[root], "Root: unknown");
        require(!nullifierUsed[nullifier], "Nullifier: already spent");
        require(
            verifier.verifyProof(proof, nullifier, root, amount),
            "Proof: invalid"
        );

        nullifierUsed[nullifier] = true;
        totalShielded -= amount;
        token.safeTransfer(msg.sender, amount);

        emit Withdrawn(nullifier, msg.sender, amount);
    }

    // ───────── Admin ─────────

    /// @notice Swap in a new ZK verifier. Callable by multisig/owner only.
    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Verifier: zero address");
        emit VerifierUpdated(address(verifier), _verifier);
        verifier = IPrivacyVerifier(_verifier);
    }
}
