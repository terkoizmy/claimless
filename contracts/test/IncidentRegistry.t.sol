// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";
import {IIncidentRegistry} from "../src/interfaces/IIncidentRegistry.sol";
import {Incident, IncidentStatus} from "../src/interfaces/ClaimlessTypes.sol";

/// @title IncidentRegistryTest
/// @notice Unit tests for the staked incident reporting layer.
contract IncidentRegistryTest is Test {
    // Mirror of IIncidentRegistry events (identical signatures) so tests can
    // emit them for vm.expectEmit; qualified event access needs solc >= 0.8.21.
    event IncidentReported(
        uint256 indexed agentId, uint256 indexed incidentId, bytes32 kind, uint8 severity, address indexed reporter
    );
    event IncidentChallenged(uint256 indexed incidentId, address indexed challenger);
    event IncidentFinalized(uint256 indexed incidentId, bool accepted);
    event ChallengeResolved(uint256 indexed incidentId, bool reportStands, address winner);

    IncidentRegistry internal registry;

    address internal reporter = makeAddr("reporter");
    address internal challenger = makeAddr("challenger");
    address internal resolver = makeAddr("resolver");
    address internal anyone = makeAddr("anyone");

    uint256 internal constant MIN_STAKE = 0.01 ether;
    uint256 internal constant CHALLENGE_WINDOW = 3 days;

    uint256 internal constant AGENT = 1;
    bytes32 internal constant KIND = keccak256("SLA_BREACH");
    bytes32 internal constant EVIDENCE = keccak256("input-output");

    function setUp() public {
        registry = new IncidentRegistry(resolver, MIN_STAKE);
    }

    /// @dev Advance both block timestamp and number deterministically.
    function warp(uint256 time) internal {
        vm.warp(time);
        vm.roll(time + 1000);
    }

    /*//////////////////////////////////////////////////////////////
                                  HELPERS
    //////////////////////////////////////////////////////////////*/

    function _report(address who, uint256 value, uint8 severity) internal returns (uint256) {
        hoax(who, value);
        return registry.reportIncident{value: value}(AGENT, KIND, severity, EVIDENCE);
    }

    function _reportValid() internal returns (uint256) {
        return _report(reporter, MIN_STAKE, 2);
    }

    function _challenge(address who, uint256 incidentId) internal {
        Incident memory inc = registry.getIncident(incidentId);
        hoax(who, inc.stake);
        registry.challenge{value: inc.stake}(incidentId);
    }

    /*//////////////////////////////////////////////////////////////
                             REPORT: VALIDATION
    //////////////////////////////////////////////////////////////*/

    function test_ReportBelowMinStakeReverts() public {
        hoax(reporter, MIN_STAKE - 1);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__InsufficientStake.selector);
        registry.reportIncident{value: MIN_STAKE - 1}(AGENT, KIND, 2, EVIDENCE);
    }

    function test_ReportExactMinStakeSucceeds() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit IncidentReported(AGENT, 0, KIND, 2, reporter);
        uint256 id = _report(reporter, MIN_STAKE, 2);
        assertEq(id, 0, "first incident id");
    }

    function test_ReportStoresAllFields() public {
        uint256 id = _reportValid();
        Incident memory inc = registry.getIncident(id);

        assertEq(inc.id, id, "id");
        assertEq(inc.agentId, AGENT, "agentId");
        assertEq(inc.kind, KIND, "kind");
        assertEq(inc.severity, 2, "severity");
        assertEq(inc.evidenceHash, EVIDENCE, "evidenceHash");
        assertEq(inc.reporter, reporter, "reporter");
        assertEq(inc.stake, MIN_STAKE, "stake");
        assertEq(inc.reportedAt, block.timestamp, "reportedAt");
        assertEq(inc.challengeDeadline, block.timestamp + CHALLENGE_WINDOW, "challengeDeadline");
        assertEq(inc.challenger, address(0), "challenger");
        assertEq(inc.challengeStake, 0, "challengeStake");
        assertTrue(inc.status == IncidentStatus.PENDING, "status");
    }

    function test_SeverityZeroReverts() public {
        hoax(reporter, MIN_STAKE);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__InvalidSeverity.selector);
        registry.reportIncident{value: MIN_STAKE}(AGENT, KIND, 0, EVIDENCE);
    }

    function test_SeveritySixReverts() public {
        hoax(reporter, MIN_STAKE);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__InvalidSeverity.selector);
        registry.reportIncident{value: MIN_STAKE}(AGENT, KIND, 6, EVIDENCE);
    }

    /*//////////////////////////////////////////////////////////////
                             REPORT: MISC
    //////////////////////////////////////////////////////////////*/

    function test_TotalIncidentsAndCounts() public {
        assertEq(registry.totalIncidents(), 0, "total before");
        _reportValid();
        _report(reporter, MIN_STAKE, 5);
        assertEq(registry.totalIncidents(), 2, "total after");
        assertEq(registry.getIncidentCount(AGENT), 2, "per-agent count");
        assertEq(registry.getIncidentCount(999), 0, "unknown agent count");
        assertEq(registry.getIncidents(AGENT).length, 2, "per-agent array length");
        assertEq(registry.getIncidents(AGENT)[1].severity, 5, "per-agent array element");
    }

    function test_OversizedStakeIsAccepted() public {
        uint256 id = _report(reporter, MIN_STAKE * 2, 3);
        assertEq(registry.getIncident(id).stake, MIN_STAKE * 2, "stake = msg.value");
    }

    /*//////////////////////////////////////////////////////////////
                               FINALIZE
    //////////////////////////////////////////////////////////////*/

    function test_FinalizeBeforeWindowReverts() public {
        uint256 id = _reportValid();
        hoax(anyone);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__ChallengeWindowOpen.selector);
        registry.finalize(id);
    }

    function test_FinalizeAfterWindowAccepts() public {
        uint256 id = _reportValid();
        uint256 deadline = registry.getIncident(id).challengeDeadline;

        // At exactly the deadline the window has elapsed; finalize is allowed.
        warp(deadline);
        registry.finalize(id);

        Incident memory inc = registry.getIncident(id);
        assertTrue(inc.status == IncidentStatus.ACCEPTED, "accepted");
        assertEq(registry.getAcceptedCount(AGENT), 1, "accepted count");
        assertEq(registry.getAcceptedSeveritySum(AGENT), 2, "severity sum");
    }

    function test_FinalizeRevertsOnUnknownIncident() public {
        vm.expectRevert(IncidentRegistry.IncidentRegistry__IncidentNotFound.selector);
        registry.finalize(0);
    }

    /*//////////////////////////////////////////////////////////////
                               CHALLENGE
    //////////////////////////////////////////////////////////////*/

    function test_ChallengeStakeMismatchReverts() public {
        uint256 id = _reportValid();
        Incident memory inc = registry.getIncident(id);
        hoax(challenger, inc.stake - 1);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__StakeMismatch.selector);
        registry.challenge{value: inc.stake - 1}(id);
    }

    function test_ChallengeRevertsAfterWindow() public {
        uint256 id = _reportValid();
        Incident memory inc = registry.getIncident(id);
        // At exactly the deadline the window is closed; stake must match so the
        // stake check does not fire before the window check.
        warp(inc.challengeDeadline);
        hoax(challenger, inc.stake);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__ChallengeWindowClosed.selector);
        registry.challenge{value: inc.stake}(id);
    }

    function test_ChallengeRevertsOnAlreadyChallenged() public {
        uint256 id = _reportValid();
        _challenge(challenger, id);
        hoax(anyone);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__NotChallengeable.selector);
        registry.challenge(id);
    }

    function test_ChallengeSetsStateAndEmits() public {
        uint256 id = _reportValid();

        vm.expectEmit(true, true, true, true, address(registry));
        emit IncidentChallenged(id, challenger);
        _challenge(challenger, id);

        Incident memory inc = registry.getIncident(id);
        assertTrue(inc.status == IncidentStatus.CHALLENGED, "status");
        assertEq(inc.challenger, challenger, "challenger");
        assertEq(inc.challengeStake, inc.stake, "challengeStake");
    }

    function test_ChallengeRevertsOnUnknownIncident() public {
        hoax(challenger);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__IncidentNotFound.selector);
        registry.challenge(0);
    }

    /*//////////////////////////////////////////////////////////////
                            RESOLVE CHALLENGE
    //////////////////////////////////////////////////////////////*/

    function test_ResolveOnlyByResolver() public {
        uint256 id = _reportValid();
        _challenge(challenger, id);

        hoax(anyone);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__NotResolver.selector);
        registry.resolveChallenge(id, true);

        hoax(resolver);
        registry.resolveChallenge(id, true);
        assertTrue(registry.getIncident(id).status == IncidentStatus.ACCEPTED, "resolved");
    }

    function test_ResolveTruePaysBothStakesToReporter() public {
        uint256 id = _report(reporter, MIN_STAKE, 2);
        uint256 reporterBefore = reporter.balance;
        uint256 challengerBefore = challenger.balance;

        _challenge(challenger, id);

        vm.expectEmit(true, true, true, true, address(registry));
        emit ChallengeResolved(id, true, reporter);
        vm.expectEmit(true, true, true, true, address(registry));
        emit IncidentFinalized(id, true);

        hoax(resolver);
        registry.resolveChallenge(id, true);

        Incident memory inc = registry.getIncident(id);
        assertTrue(inc.status == IncidentStatus.ACCEPTED, "accepted");
        assertEq(inc.challengeStake, 0, "bond released");
        assertEq(reporter.balance, reporterBefore + 2 * MIN_STAKE, "reporter takes both bonds");
        assertEq(challenger.balance, challengerBefore, "challenger forfeits");
        assertEq(address(registry).balance, 0, "no funds stuck");
        assertEq(registry.getAcceptedCount(AGENT), 1, "accepted count");
        assertEq(registry.getAcceptedSeveritySum(AGENT), 2, "severity sum");
    }

    function test_ResolveFalsePaysBothStakesToChallenger() public {
        uint256 id = _report(reporter, MIN_STAKE, 2);
        uint256 reporterBefore = reporter.balance;
        uint256 challengerBefore = challenger.balance;

        _challenge(challenger, id);

        vm.expectEmit(true, true, true, true, address(registry));
        emit ChallengeResolved(id, false, challenger);
        vm.expectEmit(true, true, true, true, address(registry));
        emit IncidentFinalized(id, false);

        hoax(resolver);
        registry.resolveChallenge(id, false);

        Incident memory inc = registry.getIncident(id);
        assertTrue(inc.status == IncidentStatus.REJECTED, "rejected");
        assertEq(inc.challengeStake, 0, "bond released");
        assertEq(challenger.balance, challengerBefore + 2 * MIN_STAKE, "challenger takes both bonds");
        assertEq(reporter.balance, reporterBefore, "reporter forfeits");
        assertEq(address(registry).balance, 0, "no funds stuck");
        assertEq(registry.getAcceptedCount(AGENT), 0, "no accepted count");
        assertEq(registry.getAcceptedSeveritySum(AGENT), 0, "no severity sum");
    }

    function test_ResolveRevertsIfNotChallenged() public {
        uint256 id = _reportValid();
        hoax(resolver);
        vm.expectRevert(IncidentRegistry.IncidentRegistry__NotChallengeable.selector);
        registry.resolveChallenge(id, true);
    }

    /*//////////////////////////////////////////////////////////////
                      PERMISSIONLESS RESOLVER (address(0))
    //////////////////////////////////////////////////////////////*/

    function test_ResolverZeroAnyoneCanResolve() public {
        registry = new IncidentRegistry(address(0), MIN_STAKE);
        uint256 id = _reportValid();
        _challenge(challenger, id);

        hoax(anyone);
        registry.resolveChallenge(id, true);
        assertTrue(registry.getIncident(id).status == IncidentStatus.ACCEPTED, "accepted");
    }

    /*//////////////////////////////////////////////////////////////
                            ACCEPTED TALLY
    //////////////////////////////////////////////////////////////*/

    function test_AcceptedTallyCountsOnlyAccepted() public {
        uint256 a = _report(reporter, MIN_STAKE, 1);
        uint256 b = _report(reporter, MIN_STAKE, 5);
        _report(reporter, MIN_STAKE, 3);

        hoax(challenger, MIN_STAKE);
        registry.challenge{value: MIN_STAKE}(b); // b now CHALLENGED

        warp(block.timestamp + CHALLENGE_WINDOW + 1);

        hoax(resolver);
        registry.finalize(a); // ACCEPTED: +1 incident, +1 severity
        hoax(resolver);
        registry.resolveChallenge(b, false); // REJECTED: not tallied
        // third stays PENDING: not tallied

        assertEq(registry.getAcceptedCount(AGENT), 1, "only one accepted");
        assertEq(registry.getAcceptedSeveritySum(AGENT), 1, "only accepted severity");
        assertEq(registry.getIncidentCount(AGENT), 3, "all reports listed");
        assertEq(registry.totalIncidents(), 3, "total incidents");
    }

    /*//////////////////////////////////////////////////////////////
                             FUZZ TESTS
    //////////////////////////////////////////////////////////////*/

    function testFuzz_ReportStoresFields(uint96 stake, uint8 severity) public {
        vm.assume(stake >= MIN_STAKE);
        vm.assume(severity >= 1 && severity <= 5);
        uint256 id = _report(reporter, stake, severity);

        Incident memory inc = registry.getIncident(id);
        assertEq(inc.stake, stake, "stake");
        assertEq(inc.severity, severity, "severity");
        assertTrue(inc.status == IncidentStatus.PENDING, "status");
    }

    function testFuzz_ResolvePaysWinnerBothStakes(uint96 stake, bool reportStands) public {
        vm.assume(stake >= MIN_STAKE);
        uint256 stake256 = uint256(stake); // avoid uint96 overflow on 2 * stake
        uint256 id = _report(reporter, stake, 2);
        uint256 reporterBefore = reporter.balance;
        uint256 challengerBefore = challenger.balance;
        _challenge(challenger, id);

        hoax(resolver);
        registry.resolveChallenge(id, reportStands);

        address expectedWinner = reportStands ? reporter : challenger;
        uint256 expectedAfter =
            reportStands ? reporterBefore + 2 * stake256 : challengerBefore + 2 * stake256;
        assertEq(expectedWinner.balance, expectedAfter, "winner takes both bonds");
        assertEq(address(registry).balance, 0, "no funds stuck");
    }

    /*//////////////////////////////////////////////////////////////
                            EDGE CASES
    //////////////////////////////////////////////////////////////*/

    function test_AgentIdsAreIsolated() public {
        _report(reporter, MIN_STAKE, 2);
        hoax(anyone);
        registry.reportIncident{value: MIN_STAKE}({agentId: 999, kind: KIND, severity: 3, evidenceHash: EVIDENCE});

        assertEq(registry.getIncidentCount(AGENT), 1, "agent 1 count");
        assertEq(registry.getIncidentCount(999), 1, "agent 999 count");
        assertEq(registry.getIncidents(AGENT)[0].severity, 2, "agent 1 severity");
        assertEq(registry.getIncidents(999)[0].severity, 3, "agent 999 severity");
    }

    function test_ChallengeDeadlineIsReportedAtPlusWindow() public {
        warp(7 days);
        uint256 id = _reportValid();
        Incident memory inc = registry.getIncident(id);
        assertEq(inc.reportedAt, 7 days, "reportedAt");
        assertEq(inc.challengeDeadline, 7 days + CHALLENGE_WINDOW, "deadline");
    }
}