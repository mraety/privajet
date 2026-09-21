// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Governed} from "../Governed.sol";

/// @dev Test fixture: a protocol contract gated by {PrivaJetGovernance}.
contract MockGoverned is Governed {
    uint256 public value;

    constructor(address governance_) Governed(governance_) {}

    function setValue(uint256 newValue) external onlyGovernance {
        value = newValue;
    }
}
