// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test fixture standing in for a DAO or multisig: a contract that can
///      forward arbitrary calls, so handover can be exercised from a real
///      contract account rather than an EOA.
contract MockCaller {
    function forward(address target, uint256 value, bytes calldata data)
        external
        payable
        returns (bytes memory)
    {
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        if (!success) {
            if (returndata.length == 0) revert("MockCaller: call reverted");
            assembly {
                revert(add(returndata, 0x20), mload(returndata))
            }
        }
        return returndata;
    }

    receive() external payable {}
}
