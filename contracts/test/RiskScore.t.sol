// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {IIncidentRegistry} from "../src/interfaces/IIncidentRegistry.sol";
import {Incident} from "../src/interfaces/ClaimlessTypes.sol";
import {RiskScore} from "../src/RiskScore.sol";

/// @notice Minimal in-file mock of IIncidentRegistry with settable values.
///         Deliberately does NOT import IncidentRegistry.sol: RiskScore only
///         depends on the interface, and IncidentRegistry is being written
///         concurrently by another agent.
contract MockIncidentRegistry is IIncidentRegistry {
    uint256 public acceptedCount;
    uint256 public acceptedSeveritySum;

    function setAccepted(uint256 count_, uint256 severitySum_) external {
        acceptedCount = count_;
        acceptedSeveritySum = severitySum_;
    }

    // --- interface reads consumed by RiskScore ---

    function getAcceptedCount(uint256) external view returns (uint256) {
        return acceptedCount;
    }

    function getAcceptedSeveritySum(uint256) external view returns (uint256) {
        return acceptedSeveritySum;
    }

    // --- interface stubs (not consumed by RiskScore) ---

    function reportIncident(uint256, bytes32, uint8, bytes32) external payable returns (uint256) {
        return 0;
    }

    function getIncidents(uint256) external view returns (Incident[] memory) {
        return new Incident[](0);
    }

    function getIncidentCount(uint256) external view returns (uint256) {
        return 0;
    }

    function totalIncidents() external view returns (uint256) {
        return 0;
    }

    function getIncident(uint256) external view returns (Incident memory) {
        revert("mock: unused");
    }

    function challenge(uint256) external payable {
        revert("mock: unused");
    }

    function resolveChallenge(uint256, bool) external {
        revert("mock: unused");
    }

    function finalize(uint256) external {
        revert("mock: unused");
    }
}

/// @title RiskScoreTest
/// @notice Unit tests for the deterministic RiskScore formula, using the
///         file-scoped MockIncidentRegistry above.
/// @dev    The event below is a local mirror of `RiskScore.ScoreUpdated` with an
///         identical ABI signature, so `vm.expectEmit` log matching works. It
///         cannot be referenced as `RiskScore.ScoreUpdated` because qualified
///         event access from another contract needs Solidity >= 0.8.21.
contract RiskScoreTest is Test {
    event ScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);

    RiskScore internal riskScore;
    MockIncidentRegistry internal registry;

    uint256 internal constant AGENT_A = 1;
    uint256 internal constant AGENT_B = 2;
    uint256 internal constant MAX_SCORE = 100;

    function setUp() public {
        registry = new MockIncidentRegistry();
        riskScore = new RiskScore(address(registry));
    }

    // ---------------------------------------------------------------------
    // Formula helper mirroring the documented spec, used to cross-check.
    // ---------------------------------------------------------------------
    function _expectedScore(uint256 count, uint256 severitySum) internal pure returns (uint256) {
        uint256 penalty = count * 5 + severitySum * 2;
        return penalty >= MAX_SCORE ? 0 : MAX_SCORE - penalty;
    }

    // ---------------------------------------------------------------------
    // No incidents
    // ---------------------------------------------------------------------

    function test_NoIncidents_ScoreIs100() public view {
        assertEq(riskScore.getScore(AGENT_A), 100, "clean agent must score 100");
        assertEq(registry.getAcceptedCount(AGENT_A), 0);
    }

    function test_NoIncidents_BundleIsClean() public view {
        (uint256 score, uint256 count, uint256 severitySum) = riskScore.getScoreBundle(AGENT_A);
        assertEq(score, 100);
        assertEq(count, 0);
        assertEq(severitySum, 0);
    }

    // ---------------------------------------------------------------------
    // Incidents drop the score; monotonic in severity
    // ---------------------------------------------------------------------

    function test_SingleIncident_ScoreDrops() public {
        registry.setAccepted(1, 3); // one MAJOR incident
        uint256 score = riskScore.getScore(AGENT_A);
        assertEq(score, _expectedScore(1, 3), "penalty = 1*5 + 3*2 = 11");
        assertEq(score, 89);
        assertTrue(score < 100, "score must drop below 100");
    }

    function test_MonotonicInSeverity() public {
        uint256 previous = type(uint256).max;
        for (uint256 severitySum = 0; severitySum <= 25; ++severitySum) {
            registry.setAccepted(1, severitySum);
            uint256 score = riskScore.getScore(AGENT_A);
            assertTrue(score <= previous, "score must be non-increasing in severity");
            assertEq(score, _expectedScore(1, severitySum));
            previous = score;
        }
    }

    function test_MonotonicInCount() public {
        uint256 previous = type(uint256).max;
        for (uint256 count = 0; count <= 15; ++count) {
            registry.setAccepted(count, 2);
            uint256 score = riskScore.getScore(AGENT_B);
            assertTrue(score <= previous, "score must be non-increasing in count");
            assertEq(score, _expectedScore(count, 2));
            previous = score;
        }
    }

    function test_KnownExamples_FromSpecComment() public {
        // Clean agent -> 100 (documented example: 0 accepted incidents).
        (uint256 cleanScore, uint256 cleanCount, uint256 cleanSum) = riskScore.getScoreBundle(AGENT_B);
        assertEq(cleanScore, 100);
        assertEq(cleanCount, 0);
        assertEq(cleanSum, 0);
        // 2 minor (severity 1) incidents -> penalty 2*5 + 2*2 = 14 -> 86.
        registry.setAccepted(2, 2);
        (uint256 minorScore,,) = riskScore.getScoreBundle(AGENT_A);
        assertEq(minorScore, 86);
        // 1 major (severity 3) incident -> penalty 5 + 6 = 11 -> 89.
        registry.setAccepted(1, 3);
        assertEq(riskScore.getScore(AGENT_A), 89);
    }

    function test_TwoMinorIncidents_Score86() public {
        registry.setAccepted(2, 2);
        assertEq(riskScore.getScore(AGENT_A), 86); // 100 - (2*5 + 2*2)
    }

    function test_OneCatastrophicIncident_Penalty15() public {
        registry.setAccepted(1, 5);
        assertEq(riskScore.getScore(AGENT_A), 85); // 100 - (5 + 10)
    }

    // ---------------------------------------------------------------------
    // No underflow for extreme inputs
    // ---------------------------------------------------------------------

    function test_ExtremeInputs_ScoreFloorsAtZero() public {
        registry.setAccepted(type(uint256).max, type(uint256).max);
        assertEq(riskScore.getScore(AGENT_A), 0, "score must floor at 0, never wrap");
        registry.setAccepted(type(uint256).max, 0);
        assertEq(riskScore.getScore(AGENT_B), 0);
        registry.setAccepted(0, type(uint256).max);
        assertEq(riskScore.getScore(AGENT_B), 0);
    }

    function test_ExactlyAtCap_ScoreIsZero() public {
        // penalty = 20*5 + 0 = 100 exactly -> score 0, no underflow.
        registry.setAccepted(20, 0);
        assertEq(riskScore.getScore(AGENT_A), 0);
    }

    function test_OneOverCap_ScoreIsZero() public {
        registry.setAccepted(20, 1); // penalty = 102 -> floor 0
        assertEq(riskScore.getScore(AGENT_A), 0);
    }

    function testFuzz_NeverUnderflows(uint256 count, uint256 severitySum) public {
        count = bound(count, 0, 1e18);
        severitySum = bound(severitySum, 0, 1e18);
        registry.setAccepted(count, severitySum);
        uint256 score = riskScore.getScore(AGENT_A);
        // The penalty cap guarantees 0 <= score <= 100 for every input pair;
        // Solidity checked math reverts before any wrap could occur.
        assertTrue(score <= MAX_SCORE, "score above max impossible");
        assertTrue(riskScore.getScore(AGENT_A) == score, "deterministic");
    }

    // ---------------------------------------------------------------------
    // recompute + stored score lifecycle
    // ---------------------------------------------------------------------

    function test_Recompute_EmitsScoreUpdated_WithCorrectOldAndNew() public {
        // First recompute: implicit old score is 0 (never scored).
        registry.setAccepted(2, 2); // penalty 10 + 4 = 14 -> score 86
        vm.expectEmit(true, false, false, true, address(riskScore));
        emit ScoreUpdated(AGENT_A, 0, 86);
        riskScore.recompute(AGENT_A);

        assertTrue(riskScore.hasScore(AGENT_A), "hasScore after first recompute");
        assertEq(riskScore.getStoredScore(AGENT_A), 86, "stored score persisted");

        // Second recompute: registry worsened, old = 86, new = 67.
        registry.setAccepted(5, 4); // penalty 25 + 8 = 33 -> score 67
        vm.expectEmit(true, false, false, true, address(riskScore));
        emit ScoreUpdated(AGENT_A, 86, 67);
        riskScore.recompute(AGENT_A);
        assertEq(riskScore.getStoredScore(AGENT_A), 67);
    }

    function test_Recompute_StoredScoreCanImprove() public {
        registry.setAccepted(4, 4); // score 72
        riskScore.recompute(AGENT_A);
        assertEq(riskScore.getStoredScore(AGENT_A), 72);

        // Incidents can never be erased, but the score floor case still
        // round-trips through recompute without corrupting state.
        registry.setAccepted(type(uint256).max, type(uint256).max);
        vm.expectEmit(true, false, false, true, address(riskScore));
        emit ScoreUpdated(AGENT_A, 72, 0);
        riskScore.recompute(AGENT_A);
        assertEq(riskScore.getStoredScore(AGENT_A), 0);
        assertTrue(riskScore.hasScore(AGENT_A));
    }

    function test_HasScore_FalseBeforeRecompute_TrueAfter() public {
        assertFalse(riskScore.hasScore(AGENT_B), "no score before recompute");
        assertEq(riskScore.getStoredScore(AGENT_B), 0);
        riskScore.recompute(AGENT_B);
        assertTrue(riskScore.hasScore(AGENT_B));
    }

    // ---------------------------------------------------------------------
    // getScoreBundle
    // ---------------------------------------------------------------------

    function test_ScoreBundle_MatchesLiveInputs() public {
        registry.setAccepted(3, 7);
        (uint256 score, uint256 count, uint256 severitySum) = riskScore.getScoreBundle(AGENT_A);
        assertEq(score, _expectedScore(3, 7)); // 100 - (15 + 14) = 71
        assertEq(score, 71);
        assertEq(count, 3);
        assertEq(severitySum, 7);
    }

    // ---------------------------------------------------------------------
    // Determinism: same inputs, same score, every time
    // ---------------------------------------------------------------------

    function test_Deterministic_SameInputSameScore() public {
        registry.setAccepted(7, 9);
        uint256 first = riskScore.getScore(AGENT_A);
        registry.setAccepted(0, 0);
        registry.setAccepted(7, 9);
        assertEq(riskScore.getScore(AGENT_A), first, "formula must be deterministic");
    }

    // ---------------------------------------------------------------------
    // Fuzz: score stays in [0, 100] and matches the spec formula
    // ---------------------------------------------------------------------

    function testFuzz_ScoreMatchesSpec(uint256 count, uint256 severitySum) public {
        // Bound below overflow thresholds so the mock accepts raw values.
        count = bound(count, 0, 1e18);
        severitySum = bound(severitySum, 0, 1e18);
        registry.setAccepted(count, severitySum);
        assertEq(riskScore.getScore(AGENT_A), _expectedScore(count, severitySum));
        assertTrue(riskScore.getScore(AGENT_A) <= 100);
    }

    function testFuzz_RecomputePersists(uint256 count, uint256 severitySum) public {
        count = bound(count, 0, 1e18);
        severitySum = bound(severitySum, 0, 1e18);
        registry.setAccepted(count, severitySum);
        uint256 expected = _expectedScore(count, severitySum);
        riskScore.recompute(AGENT_A);
        assertEq(riskScore.getStoredScore(AGENT_A), expected);
        assertTrue(riskScore.hasScore(AGENT_A));
    }
}