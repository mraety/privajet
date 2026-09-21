// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test fixture: a contract governance can drive through `execute`.
contract MockTarget {
    uint256 public value;
    address public lastCaller;
    uint256 public lastValue;

    function setValue(uint256 newValue) external payable {
        value = newValue;
        lastCaller = msg.sender;
        lastValue = msg.value;
    }

    function boom() external pure {
        revert("MockTarget: boom");
    }

    function boomSilently() external pure {
        assembly {
            revert(0, 0)
        }
    }

    receive() external payable {
        lastCaller = msg.sender;
        lastValue = msg.value;
    }
}
