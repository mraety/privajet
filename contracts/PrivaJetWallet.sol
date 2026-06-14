// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/IShieldedPool.sol";

/**
 * @title PrivaJetWallet
 * @notice Upgradeable (UUPS) multi-user wallet for PRIVA tokens with built-in
 *         hooks for the upcoming ZK privacy layer.
 *
 * ┌─────────────────────────────────────────────┐
 * │  V1 — shipped now                           │
 * │    deposit / withdraw / transfer             │
 * │    shield / unshield stubs (pool must be set)│
 * ├─────────────────────────────────────────────┤
 * │  V2 — upcoming (privacy module upgrade)      │
 * │    real ZK shielded transfers via pool       │
 * │    stealth address resolution                │
 * │    encrypted note storage                    │
 * └─────────────────────────────────────────────┘
 *
 * Storage layout is frozen for V1 variables.  Future versions add new variables
 * inside the __gap.  Never reorder or remove existing slots.
 */
contract PrivaJetWallet is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // ─────────────────────────────────────────────────────────────────────────
    // Storage  (V1)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The PRIVA token held by this wallet.
    IERC20Upgradeable public token;

    /// @notice Optional ShieldedPool integration.  Zero until the pool is set.
    IShieldedPool public shieldedPool;

    /// @dev Per-user PRIVA balances tracked inside the wallet contract.
    mapping(address => uint256) private _balances;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Transferred(address indexed from, address indexed to, uint256 amount);
    event Shielded(address indexed user, uint256 amount, bytes32 commitment);
    event Unshielded(address indexed user, uint256 amount);
    event ShieldedPoolSet(address indexed oldPool, address indexed newPool);

    // ─────────────────────────────────────────────────────────────────────────
    // Initializer
    // ─────────────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Deploy via OpenZeppelin's `upgrades.deployProxy` with this initializer.
    function initialize(address _token) external initializer {
        require(_token != address(0), "Token: zero address");
        __Ownable_init();
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        token = IERC20Upgradeable(_token);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core wallet operations
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pull PRIVA from caller's ERC20 balance into their wallet balance.
    ///         Caller must first approve this contract for at least `amount`.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount: zero");
        token.safeTransferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Return PRIVA from wallet balance to caller's ERC20 wallet.
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount: zero");
        require(_balances[msg.sender] >= amount, "Wallet: insufficient balance");
        _balances[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Move PRIVA between wallet users without touching the ERC20 contract.
    function transfer(address to, uint256 amount) external nonReentrant whenNotPaused {
        require(to != address(0), "To: zero address");
        require(to != msg.sender, "To: self");
        require(amount > 0, "Amount: zero");
        require(_balances[msg.sender] >= amount, "Wallet: insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        emit Transferred(msg.sender, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Privacy hooks  — V1 stubs; become fully live after V2 upgrade +
    // ShieldedPool configured with a real ZK verifier.
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Move PRIVA from wallet balance into the ShieldedPool under a
    ///         cryptographic commitment.  After this call the tokens are hidden
    ///         inside the pool; only a valid ZK proof can recover them.
    ///
    ///         Reverts until `shieldedPool` is configured via setShieldedPool.
    ///
    /// @param amount     Amount to shield.
    /// @param commitment Pedersen/Poseidon commitment to the deposited note.
    function shield(
        uint256 amount,
        bytes32 commitment
    ) external nonReentrant whenNotPaused {
        require(address(shieldedPool) != address(0), "Privacy: pool not configured");
        require(amount > 0, "Amount: zero");
        require(commitment != bytes32(0), "Commitment: zero");
        require(_balances[msg.sender] >= amount, "Wallet: insufficient balance");

        _balances[msg.sender] -= amount;
        // Approve exactly `amount` to the pool then invoke its deposit.
        token.safeIncreaseAllowance(address(shieldedPool), amount);
        shieldedPool.deposit(amount, commitment);

        emit Shielded(msg.sender, amount, commitment);
    }

    /// @notice Claim a shielded note back from the pool into wallet balance.
    ///         Reverts with "Proof: invalid" on VerifierStub; becomes live
    ///         once the real ZK verifier is installed.
    ///
    /// @param amount    Amount being withdrawn from the pool.
    /// @param proof     Serialised ZK proof.
    /// @param nullifier Unique nullifier to prevent double-spend.
    /// @param root      Merkle root the proof is pinned to.
    function unshield(
        uint256 amount,
        bytes calldata proof,
        bytes32 nullifier,
        bytes32 root
    ) external nonReentrant whenNotPaused {
        require(address(shieldedPool) != address(0), "Privacy: pool not configured");
        // Pool transfers tokens to this contract; balance credited to caller.
        shieldedPool.withdraw(amount, proof, nullifier, root);
        _balances[msg.sender] += amount;
        emit Unshielded(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View
    // ─────────────────────────────────────────────────────────────────────────

    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Wire up (or swap) the ShieldedPool.  Pass address(0) to disable.
    function setShieldedPool(address _pool) external onlyOwner {
        emit ShieldedPoolSet(address(shieldedPool), _pool);
        shieldedPool = IShieldedPool(_pool);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UUPS upgrade gate
    // ─────────────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─────────────────────────────────────────────────────────────────────────
    // Storage gap — V2 adds new variables here instead of appending after gap.
    // Current usage: token(1) + shieldedPool(1) + _balances(1) = 3 slots.
    // ─────────────────────────────────────────────────────────────────────────
    uint256[47] private __gap;
}
