// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIncidentRegistry} from "./interfaces/IIncidentRegistry.sol";
import {Incident, IncidentStatus} from "./interfaces/ClaimlessTypes.sol";

/// @title IncidentRegistry
/// @notice Staked, evidence-hashed incident reporting layer for ERC-8004 agents.
///         Optimistic dispute model: a reporter bonds MIN_STAKE; a challenger can
///         match that bond within `CHALLENGE_WINDOW`; the configured resolver (or
///         anyone, when no resolver is set) settles the duel and the winner takes
///         both bonds.
contract IncidentRegistry is IIncidentRegistry {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Address allowed to resolve challenges. address(0) = permissionless.
    address public immutable resolver;

    /// @notice Minimum bond required to report an incident.
    uint256 public immutable minStake;

    /// @notice How long a fresh report stays challengeable.
    uint256 public constant CHALLENGE_WINDOW = 3 days;

    error IncidentRegistry__InsufficientStake();
    error IncidentRegistry__InvalidSeverity();
    error IncidentRegistry__NotChallengeable();
    error IncidentRegistry__ChallengeWindowClosed();
    error IncidentRegistry__StakeMismatch();
    error IncidentRegistry__NotResolver();
    error IncidentRegistry__TransferFailed();
    error IncidentRegistry__NotPending();
    error IncidentRegistry__ChallengeWindowOpen();
    error IncidentRegistry__IncidentNotFound();

    /// @notice All incidents ever reported, indexed by global incident id.
    Incident[] internal _incidents;

    /// @notice Incident ids per agent, for getIncidents/getIncidentCount.
    mapping(uint256 agentId => uint256[] incidentIds) internal _incidentIdsByAgent;

    /// @notice Accepted incident count per agent. Used by RiskScore.
    mapping(uint256 agentId => uint256 count) internal _acceptedCount;

    /// @notice Sum of severity over accepted incidents per agent. Used by RiskScore.
    mapping(uint256 agentId => uint256 sum) internal _acceptedSeveritySum;

    constructor(address _resolver, uint256 _minStake) {
        resolver = _resolver;
        minStake = _minStake;
    }

    /*//////////////////////////////////////////////////////////////
                            INCIDENT REPORTING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncidentRegistry
    function reportIncident(uint256 agentId, bytes32 kind, uint8 severity, bytes32 evidenceHash)
        external
        payable
        returns (uint256 incidentId)
    {
        if (msg.value < minStake) revert IncidentRegistry__InsufficientStake();
        if (severity < 1 || severity > 5) revert IncidentRegistry__InvalidSeverity();

        uint40 reportedAt = uint40(block.timestamp);
        incidentId = _incidents.length;

        _incidents.push(
            Incident({
                id: incidentId,
                agentId: agentId,
                kind: kind,
                severity: severity,
                evidenceHash: evidenceHash,
                reporter: msg.sender,
                stake: msg.value,
                reportedAt: reportedAt,
                challengeDeadline: reportedAt + uint40(CHALLENGE_WINDOW),
                challenger: address(0),
                challengeStake: 0,
                status: IncidentStatus.PENDING
            })
        );
        _incidentIdsByAgent[agentId].push(incidentId);

        emit IncidentReported(agentId, incidentId, kind, severity, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                            CHALLENGE FLOW
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncidentRegistry
    function challenge(uint256 incidentId) external payable {
        Incident storage inc = _getIncidentStorage(incidentId);
        if (inc.status != IncidentStatus.PENDING) revert IncidentRegistry__NotChallengeable();
        if (block.timestamp >= inc.challengeDeadline) revert IncidentRegistry__ChallengeWindowClosed();
        if (msg.value != inc.stake) revert IncidentRegistry__StakeMismatch();

        inc.challenger = msg.sender;
        inc.challengeStake = msg.value;
        inc.status = IncidentStatus.CHALLENGED;

        emit IncidentChallenged(incidentId, msg.sender);
    }

    /// @inheritdoc IIncidentRegistry
    function resolveChallenge(uint256 incidentId, bool reportStands) external {
        Incident storage inc = _getIncidentStorage(incidentId);
        if (resolver != address(0) && msg.sender != resolver) revert IncidentRegistry__NotResolver();
        if (inc.status != IncidentStatus.CHALLENGED) revert IncidentRegistry__NotChallengeable();

        // The winner takes both bonds: the reporter's stake and the challenger's.
        address winner = reportStands ? inc.reporter : inc.challenger;
        uint256 payout = inc.stake + inc.challengeStake;
        inc.challengeStake = 0;
        inc.status = reportStands ? IncidentStatus.ACCEPTED : IncidentStatus.REJECTED;

        _tallyAgent(inc.agentId, reportStands, inc.severity);

        (bool ok,) = winner.call{value: payout}("");
        if (!ok) revert IncidentRegistry__TransferFailed();

        emit ChallengeResolved(incidentId, reportStands, winner);
        emit IncidentFinalized(incidentId, reportStands);
    }

    /// @inheritdoc IIncidentRegistry
    function finalize(uint256 incidentId) external {
        Incident storage inc = _getIncidentStorage(incidentId);
        if (inc.status != IncidentStatus.PENDING) revert IncidentRegistry__NotPending();
        if (block.timestamp < inc.challengeDeadline) revert IncidentRegistry__ChallengeWindowOpen();

        inc.status = IncidentStatus.ACCEPTED;
        _tallyAgent(inc.agentId, true, inc.severity);

        emit IncidentFinalized(incidentId, true);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncidentRegistry
    function getIncidents(uint256 agentId) external view returns (Incident[] memory) {
        uint256 count = _incidentIdsByAgent[agentId].length;
        Incident[] memory result = new Incident[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _incidents[_incidentIdsByAgent[agentId][i]];
        }
        return result;
    }

    /// @inheritdoc IIncidentRegistry
    function getIncidentCount(uint256 agentId) external view returns (uint256) {
        return _incidentIdsByAgent[agentId].length;
    }

    /// @inheritdoc IIncidentRegistry
    function totalIncidents() external view returns (uint256) {
        return _incidents.length;
    }

    /// @inheritdoc IIncidentRegistry
    function getIncident(uint256 incidentId) external view returns (Incident memory) {
        return _getIncidentStorage(incidentId);
    }

    /// @inheritdoc IIncidentRegistry
    function getAcceptedCount(uint256 agentId) external view returns (uint256) {
        return _acceptedCount[agentId];
    }

    /// @inheritdoc IIncidentRegistry
    function getAcceptedSeveritySum(uint256 agentId) external view returns (uint256) {
        return _acceptedSeveritySum[agentId];
    }

    /*//////////////////////////////////////////////////////////////
                               INTERNALS
    //////////////////////////////////////////////////////////////*/

    function _getIncidentStorage(uint256 incidentId) internal view returns (Incident storage) {
        if (incidentId >= _incidents.length) revert IncidentRegistry__IncidentNotFound();
        return _incidents[incidentId];
    }

    function _tallyAgent(uint256 agentId, bool accepted, uint8 severity) internal {
        if (accepted) {
            _acceptedCount[agentId]++;
            _acceptedSeveritySum[agentId] += severity;
        }
    }

    /*//////////////////////////////////////////////////////////////
                          CONTRACT RECOVERY PATH
    //////////////////////////////////////////////////////////////*/

    receive() external payable {}
}