// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Incident} from "./ClaimlessTypes.sol";

/// @title IIncidentRegistry
/// @notice Staked, evidence-hashed incident reporting layer. Implemented by
///         `IncidentRegistry.sol`. This is the layer ERC-8004 is missing: a
///         record that costs something to produce and cannot be silently skipped.
interface IIncidentRegistry {
    /// @notice Report an incident for an ERC-8004 agent id. Reporter must stake.
    /// @param agentId The ERC-8004 agent id (token id in the canonical registry).
    /// @param kind Failure taxonomy hash, e.g. keccak256("SLA_BREACH").
    /// @param severity 1-5.
    /// @param evidenceHash keccak256(input||output); payload stored off-chain.
    /// @return incidentId The id of the created incident.
    function reportIncident(uint256 agentId, bytes32 kind, uint8 severity, bytes32 evidenceHash)
        external
        payable
        returns (uint256 incidentId);

    function getIncidents(uint256 agentId) external view returns (Incident[] memory);

    function getIncidentCount(uint256 agentId) external view returns (uint256);

    /// @notice Total incidents ever reported (accepted + rejected + pending).
    function totalIncidents() external view returns (uint256);

    function getIncident(uint256 incidentId) external view returns (Incident memory);

    /// @notice Match the reporter's bond to dispute a report.
    function challenge(uint256 incidentId) external payable;

    /// @notice Accept or reject an unopposed/bonded report. Loser forfeits the bond.
    function resolveChallenge(uint256 incidentId, bool reportStands) external;

    /// @notice After the challenge window closes, an unopposed report is accepted.
    function finalize(uint256 incidentId) external;

    /// @notice Count of accepted incidents for an agent. Used by RiskScore.
    function getAcceptedCount(uint256 agentId) external view returns (uint256);

    /// @notice Sum of severity over accepted incidents. Used by RiskScore.
    function getAcceptedSeveritySum(uint256 agentId) external view returns (uint256);

    event IncidentReported(
        uint256 indexed agentId,
        uint256 indexed incidentId,
        bytes32 kind,
        uint8 severity,
        address indexed reporter
    );
    event IncidentChallenged(uint256 indexed incidentId, address indexed challenger);
    event IncidentFinalized(uint256 indexed incidentId, bool accepted);
    event ChallengeResolved(uint256 indexed incidentId, bool reportStands, address winner);
}
