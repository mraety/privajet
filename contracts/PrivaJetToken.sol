// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title PrivaJetToken
 * @notice PRIVA — native ERC20 for the PrivaJet privacy protocol.
 *         Deployed behind a UUPS proxy; the entire 1 B supply is minted to the
 *         treasury multisig on initialization and distributed via VestingManager.
 */
contract PrivaJetToken is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __ERC20_init("PrivaJet", "PRIVA");
        __ERC20Permit_init("PrivaJet");
        __Ownable_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _mint(msg.sender, MAX_SUPPLY);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    uint256[50] private __gap;
}
