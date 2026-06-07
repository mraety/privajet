// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title VestingManager
 * @notice Linear token vesting with optional cliff for multiple beneficiaries.
 *         The treasury multisig funds this contract with PRIVA after deployment.
 */
contract VestingManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 released;
        uint64  startTime;
        uint64  cliffDuration;  // seconds before any tokens unlock
        uint64  vestingDuration; // total vesting period in seconds
        bool    revoked;
    }

    IERC20 public immutable token;

    mapping(address => VestingSchedule) public schedules;

    event ScheduleCreated(
        address indexed beneficiary,
        uint256 totalAmount,
        uint64  startTime,
        uint64  cliffDuration,
        uint64  vestingDuration
    );
    event Released(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed beneficiary, uint256 returned);

    constructor(address _token) {
        require(_token != address(0), "Token: zero address");
        token = IERC20(_token);
    }

    // ───────── Admin ─────────

    /// @notice Create a vesting schedule for `beneficiary`.
    function createSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint64  startTime,
        uint64  cliffDuration,
        uint64  vestingDuration
    ) external onlyOwner {
        require(beneficiary != address(0), "Beneficiary: zero address");
        require(totalAmount > 0, "Amount: zero");
        require(vestingDuration > 0, "Duration: zero");
        require(schedules[beneficiary].totalAmount == 0, "Schedule: already exists");
        require(
            token.balanceOf(address(this)) >= totalAmount,
            "Insufficient contract balance"
        );

        schedules[beneficiary] = VestingSchedule({
            totalAmount:     totalAmount,
            released:        0,
            startTime:       startTime,
            cliffDuration:   cliffDuration,
            vestingDuration: vestingDuration,
            revoked:         false
        });

        emit ScheduleCreated(beneficiary, totalAmount, startTime, cliffDuration, vestingDuration);
    }

    /// @notice Revoke a schedule and return unvested tokens to owner.
    function revoke(address beneficiary) external onlyOwner {
        VestingSchedule storage s = schedules[beneficiary];
        require(s.totalAmount > 0, "Schedule: not found");
        require(!s.revoked, "Schedule: already revoked");

        uint256 vested = _vestedAmount(s);
        uint256 toReturn = s.totalAmount - vested;

        s.revoked = true;
        if (toReturn > 0) {
            token.safeTransfer(owner(), toReturn);
        }

        emit Revoked(beneficiary, toReturn);
    }

    // ───────── Beneficiary ─────────

    /// @notice Release all currently vested tokens to the caller.
    function release() external nonReentrant {
        VestingSchedule storage s = schedules[msg.sender];
        require(s.totalAmount > 0, "Schedule: not found");
        require(!s.revoked, "Schedule: revoked");

        uint256 amount = _vestedAmount(s) - s.released;
        require(amount > 0, "Nothing to release");

        s.released += amount;
        token.safeTransfer(msg.sender, amount);

        emit Released(msg.sender, amount);
    }

    // ───────── View ─────────

    function releasable(address beneficiary) external view returns (uint256) {
        VestingSchedule storage s = schedules[beneficiary];
        if (s.totalAmount == 0 || s.revoked) return 0;
        return _vestedAmount(s) - s.released;
    }

    function _vestedAmount(VestingSchedule storage s) internal view returns (uint256) {
        uint256 elapsed = block.timestamp > s.startTime
            ? block.timestamp - s.startTime
            : 0;

        if (elapsed < s.cliffDuration) return 0;
        if (elapsed >= s.vestingDuration) return s.totalAmount;
        return (s.totalAmount * elapsed) / s.vestingDuration;
    }
}
