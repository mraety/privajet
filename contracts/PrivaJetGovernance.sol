// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IPrivaJetGovernance} from "./interfaces/IPrivaJetGovernance.sol";

/// @title PrivaJetGovernance
/// @notice Permanent governance root for the PrivaJet protocol.
/// @dev The protocol ships before the DAO exists. Ownership of the protocol
///      contracts (token proxy, VestingManager, ShieldedPool) is handed to this
///      contract at deployment and never moves again. Until the DAO is live, a
///      guardian multisig acts through it; once a DAO address is set, the DAO
///      becomes the sole authority and the guardian can renounce itself.
///
///      Handover is deliberately slow and two-sided:
///        1. the current authority calls {proposeDao},
///        2. after `handoverDelay` the proposed DAO itself calls {acceptDao},
///           proving the address is real and controllable.
///
///      There is no path back from a live DAO to the guardian. A DAO may only
///      hand over to another DAO through the same two-step flow.
contract PrivaJetGovernance is IPrivaJetGovernance, ReentrancyGuard {
    /// @notice A single call executed by the authority through this contract.
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Bounds on the delay between {proposeDao} and {acceptDao}.
    uint256 public constant MIN_HANDOVER_DELAY = 1 days;
    uint256 public constant MAX_HANDOVER_DELAY = 30 days;

    /// @notice Delay a DAO handover must sit for before it can be accepted.
    uint256 public immutable handoverDelay;

    /// @inheritdoc IPrivaJetGovernance
    address public dao;

    /// @inheritdoc IPrivaJetGovernance
    address public guardian;

    /// @notice DAO address awaiting acceptance, or `address(0)` when none.
    address public pendingDao;

    /// @notice Guardian address awaiting acceptance, or `address(0)` when none.
    address public pendingGuardian;

    /// @notice Timestamp at which {pendingDao} may call {acceptDao}.
    uint256 public daoHandoverReadyAt;

    /// @notice Timestamp at which the DAO took over, or 0 while it has not.
    uint256 public daoActivatedAt;

    event DaoProposed(address indexed dao, uint256 readyAt);
    event DaoProposalCancelled(address indexed dao);
    event DaoActivated(address indexed previousDao, address indexed dao);
    event GuardianTransferProposed(address indexed guardian);
    event GuardianTransferCancelled(address indexed guardian);
    event GuardianTransferred(address indexed previousGuardian, address indexed guardian);
    event GuardianRenounced(address indexed guardian);
    event CallExecuted(address indexed target, uint256 value, bytes data, bytes result);
    event EtherReceived(address indexed from, uint256 value);

    error ZeroAddress();
    error NotAuthority(address caller);
    error NotGuardian(address caller);
    error NotPendingDao(address caller);
    error NotPendingGuardian(address caller);
    error DelayOutOfRange(uint256 delay);
    error DaoNotAContract(address dao);
    error DaoUnchanged(address dao);
    error NoPendingDao();
    error NoPendingGuardian();
    error HandoverNotReady(uint256 readyAt);
    error DaoNotActive();
    error EmptyBatch();

    /// @param guardian_ Multisig that governs the protocol until the DAO is live.
    /// @param handoverDelay_ Seconds a DAO handover must sit for, within
    ///        [{MIN_HANDOVER_DELAY}, {MAX_HANDOVER_DELAY}].
    constructor(address guardian_, uint256 handoverDelay_) {
        if (guardian_ == address(0)) revert ZeroAddress();
        if (handoverDelay_ < MIN_HANDOVER_DELAY || handoverDelay_ > MAX_HANDOVER_DELAY) {
            revert DelayOutOfRange(handoverDelay_);
        }

        guardian = guardian_;
        handoverDelay = handoverDelay_;

        emit GuardianTransferred(address(0), guardian_);
    }

    /// @dev Restricts a call to the current authority: the DAO once live,
    ///      the guardian before that.
    modifier onlyAuthority() {
        address current = authority();
        if (msg.sender != current) revert NotAuthority(msg.sender);
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian(msg.sender);
        _;
    }

    /// @inheritdoc IPrivaJetGovernance
    function authority() public view returns (address) {
        address dao_ = dao;
        return dao_ == address(0) ? guardian : dao_;
    }

    /// @inheritdoc IPrivaJetGovernance
    function isGovernor(address account) external view returns (bool) {
        return account != address(0) && account == authority();
    }

    /// @notice True once a DAO has accepted the handover.
    function daoIsActive() public view returns (bool) {
        return dao != address(0);
    }

    // ---------------------------------------------------------------------
    // DAO handover
    // ---------------------------------------------------------------------

    /// @notice Start the handover to `newDao`.
    /// @dev Callable by the guardian before the DAO exists, and by the DAO
    ///      afterwards when migrating to a successor DAO. Replaces any pending
    ///      proposal and restarts the delay.
    /// @param newDao Deployed DAO contract (Governor, Safe, timelock, ...).
    function proposeDao(address newDao) external onlyAuthority {
        if (newDao == address(0)) revert ZeroAddress();
        if (newDao == dao) revert DaoUnchanged(newDao);
        // A DAO is always a contract; this catches handovers to a mistyped or
        // otherwise unusable EOA, which would brick governance permanently.
        if (newDao.code.length == 0) revert DaoNotAContract(newDao);

        uint256 readyAt = block.timestamp + handoverDelay;
        pendingDao = newDao;
        daoHandoverReadyAt = readyAt;

        emit DaoProposed(newDao, readyAt);
    }

    /// @notice Drop a pending DAO proposal.
    function cancelDaoProposal() external onlyAuthority {
        address pending = pendingDao;
        if (pending == address(0)) revert NoPendingDao();

        delete pendingDao;
        delete daoHandoverReadyAt;

        emit DaoProposalCancelled(pending);
    }

    /// @notice Complete the handover. Callable only by the proposed DAO itself,
    ///         and only once the delay has elapsed.
    function acceptDao() external {
        address pending = pendingDao;
        if (pending == address(0)) revert NoPendingDao();
        if (msg.sender != pending) revert NotPendingDao(msg.sender);

        uint256 readyAt = daoHandoverReadyAt;
        if (block.timestamp < readyAt) revert HandoverNotReady(readyAt);

        address previousDao = dao;
        dao = pending;
        daoActivatedAt = block.timestamp;
        delete pendingDao;
        delete daoHandoverReadyAt;

        emit DaoActivated(previousDao, pending);
    }

    // ---------------------------------------------------------------------
    // Guardian role
    // ---------------------------------------------------------------------

    /// @notice Start a transfer of the guardian role (two-step).
    function transferGuardian(address newGuardian) external onlyGuardian {
        if (newGuardian == address(0)) revert ZeroAddress();

        pendingGuardian = newGuardian;
        emit GuardianTransferProposed(newGuardian);
    }

    /// @notice Drop a pending guardian transfer.
    function cancelGuardianTransfer() external onlyGuardian {
        address pending = pendingGuardian;
        if (pending == address(0)) revert NoPendingGuardian();

        delete pendingGuardian;
        emit GuardianTransferCancelled(pending);
    }

    /// @notice Accept the guardian role. Callable only by the proposed guardian.
    function acceptGuardian() external {
        address pending = pendingGuardian;
        if (pending == address(0)) revert NoPendingGuardian();
        if (msg.sender != pending) revert NotPendingGuardian(msg.sender);

        address previousGuardian = guardian;
        guardian = pending;
        delete pendingGuardian;

        emit GuardianTransferred(previousGuardian, pending);
    }

    /// @notice Permanently give up the guardian role.
    /// @dev Only once the DAO is live, so the protocol is never left without an
    ///      authority. This is the end state: DAO-only governance.
    function renounceGuardian() external onlyGuardian {
        if (!daoIsActive()) revert DaoNotActive();

        address previousGuardian = guardian;
        delete guardian;
        delete pendingGuardian;

        emit GuardianRenounced(previousGuardian);
    }

    // ---------------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------------

    /// @notice Execute an arbitrary call as this contract.
    /// @dev This is how the authority drives contracts owned by governance —
    ///      `pool.setVerifier(...)`, `token.upgradeTo(...)`, and so on.
    function execute(address target, uint256 value, bytes calldata data)
        external
        payable
        onlyAuthority
        nonReentrant
        returns (bytes memory result)
    {
        result = _execute(target, value, data);
    }

    /// @notice Execute several calls in order, reverting all of them on failure.
    function executeBatch(Call[] calldata calls)
        external
        payable
        onlyAuthority
        nonReentrant
        returns (bytes[] memory results)
    {
        uint256 length = calls.length;
        if (length == 0) revert EmptyBatch();

        results = new bytes[](length);
        for (uint256 i = 0; i < length; ++i) {
            results[i] = _execute(calls[i].target, calls[i].value, calls[i].data);
        }
    }

    function _execute(address target, uint256 value, bytes calldata data)
        private
        returns (bytes memory)
    {
        if (target == address(0)) revert ZeroAddress();

        (bool success, bytes memory returndata) = target.call{value: value}(data);
        if (!success) _bubbleRevert(returndata);

        emit CallExecuted(target, value, data, returndata);
        return returndata;
    }

    /// @dev Re-throws the target's revert reason so callers see why a
    ///      governance action failed instead of a bare failure.
    function _bubbleRevert(bytes memory returndata) private pure {
        if (returndata.length == 0) revert("PrivaJetGovernance: call reverted");
        assembly {
            revert(add(returndata, 0x20), mload(returndata))
        }
    }

    /// @notice Accept ETH so governance can hold and forward protocol funds.
    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }
}
