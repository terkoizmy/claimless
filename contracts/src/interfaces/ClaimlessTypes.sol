// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Shared Claimless types
/// @notice Common structs and enums used across IncidentRegistry, RiskScore,
///         AgentIdentity and CoverPool. Kept in one file so parallel work does
///         not diverge.

/// @notice Severity of a reported incident, 1 (minor) to 5 (severe).
/// @dev Stored as uint8 on-chain; this enum documents the intended scale.
enum Severity {
    NONE,
    MINOR,
    MODERATE,
    MAJOR,
    CRITICAL,
    CATASTROPHIC
}

/// @notice Lifecycle of a report under the optimistic dispute model.
enum IncidentStatus {
    PENDING, // reported, challenge window open
    ACCEPTED, // unchallenged past the window, or challenge resolved in its favour
    REJECTED, // challenge resolved against it
    CHALLENGED // under active challenge
}

/// @notice A single incident report.
struct Incident {
    uint256 id; // global incident id
    uint256 agentId; // ERC-8004 agent id (token id of the canonical registry)
    bytes32 kind; // e.g. keccak256("SLA_BREACH")
    uint8 severity; // 1-5, see Severity
    bytes32 evidenceHash; // keccak256(input||output); payload off-chain
    address reporter; // staked reporter
    uint256 stake; // bond posted by the reporter
    uint40 reportedAt; // block timestamp
    uint40 challengeDeadline; // reportedAt + CHALLENGE_WINDOW
    address challenger; // zero if unchallenged
    uint256 challengeStake; // bond matched by the challenger
    IncidentStatus status;
}
