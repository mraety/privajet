// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============================================================
// PrivaJetToken — Upgradeable ERC-20 with stealth addresses
// Privacy model: ERC-5564 announcement-based stealth addresses.
// Senders compute a one-time stealth address per recipient and
// emit an Announcement event. Recipients scan events off-chain
// and use the ephemeral public key to check ownership.
// ============================================================

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract PrivaJetToken is
    Initializable,
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ─── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Confirmed 3-of-5 multisig. Must match TREASURY_MULTISIG in VestingManager.
    address public constant TREASURY_MULTISIG =
        0x94B94c77Af56e11b12af99b8497Dc64216bFba55;

    /// @notice Fixed total supply — no minting after initialization.
    uint256 public constant TOTAL_SUPPLY = 60_000_000 * 10 ** 18;

    // ─── ERC-5564 stealth address events ─────────────────────────────────────

    /**
     * @dev Emitted when a sender announces a stealth transfer.
     *
     * @param schemeId Cryptographic scheme identifier.
     *                 0 = SECP256k1 (standard Ethereum curve).
     * @param stealthAddress The one-time address that received (or will receive) tokens.
     * @param caller The address that called announce() or transferWithAnnouncement().
     * @param ephemeralPubKey Sender's one-time public key (65 bytes uncompressed for scheme 0).
     *                        Recipients use this + their private key to derive the stealth
     *                        private key via ECDH.
     * @param metadata At minimum a 1-byte view tag (first byte of sha256(shared_secret)).
     *                 May optionally include the token address (20 bytes) and an
     *                 encrypted amount for richer off-chain scanning.
     */
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    /**
     * @notice Initialize the proxy.
     *
     * Mints the entire fixed supply to TREASURY_MULTISIG.
     * All admin/pauser/upgrader roles go to TREASURY_MULTISIG — never to the deployer.
     */
    function initialize() external initializer {
        __ERC20_init("PrivaJet", "PRIVA");
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, TREASURY_MULTISIG);
        _grantRole(PAUSER_ROLE, TREASURY_MULTISIG);
        _grantRole(UPGRADER_ROLE, TREASURY_MULTISIG);

        _mint(TREASURY_MULTISIG, TOTAL_SUPPLY);
    }

    // ─── Stealth address support (ERC-5564) ───────────────────────────────────

    /**
     * @notice Announce a stealth transfer without moving tokens.
     *
     * Use this when you sent tokens to a stealth address via a regular transfer()
     * and want to announce separately, or when you need to re-announce.
     *
     * @param schemeId Cryptographic scheme (0 = SECP256k1).
     * @param stealthAddress The one-time recipient address.
     * @param ephemeralPubKey Sender's ephemeral public key.
     * @param metadata View tag + optional encrypted metadata.
     */
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external {
        require(stealthAddress != address(0), "Invalid stealth address");
        require(ephemeralPubKey.length > 0, "Missing ephemeral pubkey");
        require(metadata.length > 0, "Missing metadata");
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }

    /**
     * @notice Transfer tokens to a stealth address and announce in a single transaction.
     *
     * This is the primary privacy-preserving transfer method. Instead of calling
     * transfer() + announce() separately (two txs, linkable), do it atomically.
     *
     * A 0.1% burn is applied on every private transfer (per PrivaJet tokenomics).
     * The recipient receives `amount - burnAmount`; `burnAmount` is permanently destroyed.
     * Integer division means amounts < 1000 wei incur no burn (effectively zero fee).
     *
     * @param stealthAddress One-time stealth address derived by the sender for this recipient.
     * @param amount Token amount (in wei) to deduct from the caller.
     * @param schemeId Cryptographic scheme (0 = SECP256k1).
     * @param ephemeralPubKey Sender's ephemeral public key.
     * @param metadata At minimum a 1-byte view tag.
     * @return Always true (reverts on failure).
     */
    function transferWithAnnouncement(
        address stealthAddress,
        uint256 amount,
        uint256 schemeId,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external whenNotPaused returns (bool) {
        require(stealthAddress != address(0), "Invalid stealth address");
        require(amount > 0, "Amount must be > 0");
        require(ephemeralPubKey.length > 0, "Missing ephemeral pubkey");
        require(metadata.length > 0, "Missing metadata");

        // 0.1% deflationary burn per private transfer.
        uint256 burnAmount = amount / 1000;
        uint256 sendAmount = amount - burnAmount;

        if (burnAmount > 0) {
            _burn(msg.sender, burnAmount);
        }
        _transfer(msg.sender, stealthAddress, sendAmount);
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
        return true;
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ─── UUPS upgrade authorization ───────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ─── Override resolution ──────────────────────────────────────────────────

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
