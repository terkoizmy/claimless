// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIncidentRegistry} from "./interfaces/IIncidentRegistry.sol";

/// @title RiskScore
/// @notice Deterministic, on-chain credit score for ERC-8004 agents, derived
///         purely from accepted incidents in the {IIncidentRegistry}.
/// @dev    There is no oracle and no randomness here. That is deliberate: the
///         project thesis is "measurable, not discretionary". Any party can
///         re-run the formula and get the exact same number, which makes
///         premiums in `CoverPool` predictable and auditable.
contract RiskScore {
    // ---------------------------------------------------------------------
    // Scoring formula (deterministic, documented so it can be replicated):
    //
    //   score = 100 - penalty, where
    //   penalty = acceptedCount * FREQ_WEIGHT + severitySum * SEV_WEIGHT,
    //   capped at 100 so the score floors at 0 (no underflow).
    //
    //   - FREQ_WEIGHT = 5: each accepted incident costs 5 points regardless of
    //     severity. Repeated failures matter even when each one is minor.
    //   - SEV_WEIGHT  = 2: each point of summed severity costs 2 points.
    //     A single CATASTROPHIC (severity 5) incident costs 5 + 5*2 = 15 points.
    //
    //   Examples:
    //   - 0 accepted incidents                  -> score 100 (perfect).
    //   - 2 minor (severity 1) incidents        -> penalty 2*5 + 2*2 = 14 -> score 86.
    //   - 1 major (severity 3) incident         -> penalty 5 + 6 = 11 -> score 89.
    //   - 7 catastrophic (severity 5) incidents -> penalty 35 + 70 = 105 -> capped, score 0.
    // ---------------------------------------------------------------------

    /// @notice Points deducted per accepted incident (frequency term).
    uint256 public constant FREQ_WEIGHT = 5;

    /// @notice Points deducted per unit of summed severity (severity term).
    uint256 public constant SEV_WEIGHT = 2;

    /// @notice Best possible score.
    uint256 public constant MAX_SCORE = 100;

    /// @notice The staked incident registry this score is computed from.
    IIncidentRegistry public immutable registry;

    /// @notice agentId => last computed score. Updated only by {recompute}.
    mapping(uint256 agentId => uint256 score) private _storedScores;

    /// @notice agentId => whether {recompute} has ever been called for it.
    mapping(uint256 agentId => bool seen) private _hasStoredScore;

    event ScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);

    /// @notice Revert when an agentId is malformed.
    error ZeroAgentId();

    /// @param registry_ The incident registry to read accepted incidents from.
    constructor(address registry_) {
        registry = IIncidentRegistry(registry_);
    }

    /// @notice Compute the live score for an agent from current registry data.
    /// @return 0..100, where 100 = no accepted incidents (safest), 0 = floor.
    function getScore(uint256 agentId) external view returns (uint256) {
        return _computeScore(agentId);
    }

    /// @notice Recompute and persist the score for an agent.
    /// @dev Emits {ScoreUpdated} with the previous stored score and new score.
    ///      The first call for an agent emits the implicit "old" score of 0
    ///      because a never-scored agent has no stored history.
    function recompute(uint256 agentId) external {
        uint256 oldScore = _storedScores[agentId];
        uint256 newScore = _computeScore(agentId);

        _storedScores[agentId] = newScore;
        _hasStoredScore[agentId] = true;

        emit ScoreUpdated(agentId, oldScore, newScore);
    }

    /// @notice The last score written by {recompute} for this agent.
    /// @return 0 if the agent has never been recomputed.
    function getStoredScore(uint256 agentId) external view returns (uint256) {
        return _storedScores[agentId];
    }

    /// @notice Whether {recompute} has ever run for this agent.
    function hasScore(uint256 agentId) external view returns (bool) {
        return _hasStoredScore[agentId];
    }

    /// @notice Convenience bundle for `CoverPool.quotePremium` and UIs: the
    ///         stored score plus the live registry inputs behind the live score.
    /// @return score The live computed score (not the stored one).
    /// @return acceptedCount Number of accepted incidents for the agent.
    /// @return severitySum Sum of severity over accepted incidents.
    function getScoreBundle(uint256 agentId)
        external
        view
        returns (uint256 score, uint256 acceptedCount, uint256 severitySum)
    {
        acceptedCount = registry.getAcceptedCount(agentId);
        severitySum = registry.getAcceptedSeveritySum(agentId);
        score = _penaltyToScore(acceptedCount, severitySum);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _computeScore(uint256 agentId) private view returns (uint256) {
        return _penaltyToScore(registry.getAcceptedCount(agentId), registry.getAcceptedSeveritySum(agentId));
    }

    /// @dev penalty = count * FREQ_WEIGHT + severitySum * SEV_WEIGHT, capped at
    ///      MAX_SCORE so the score floors at 0 for extreme inputs. Inputs that
    ///      would each saturate the cap on their own short-circuit to 0, which
    ///      also keeps the multiplication overflow-safe for any uint256.
    function _penaltyToScore(uint256 acceptedCount, uint256 severitySum) private pure returns (uint256) {
        // count > 20 alone means penalty >= 21*5 = 105 >= MAX_SCORE; likewise
        // severitySum > 50 means penalty >= 51*2 = 102 >= MAX_SCORE.
        if (acceptedCount > MAX_SCORE / FREQ_WEIGHT || severitySum > MAX_SCORE / SEV_WEIGHT) {
            return 0;
        }
        uint256 penalty = acceptedCount * FREQ_WEIGHT + severitySum * SEV_WEIGHT;
        if (penalty >= MAX_SCORE) {
            return 0;
        }
        return MAX_SCORE - penalty;
    }
}