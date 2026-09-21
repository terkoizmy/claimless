// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ParametricTrigger} from "../src/ParametricTrigger.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {RiskScore} from "../src/RiskScore.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";

/// @notice Tests for ParametricTrigger.
///
/// The two claims worth proving are negative claims, which is why they get the
/// most attention here:
///   1. No approval step exists between a met condition and a payout.
///   2. A CRE report cannot cause a payout that on-chain state does not justify.
contract ParametricTriggerTest is Test {
    ParametricTrigger trigger;
    CoverPool pool;
    RiskScore score;
    IncidentRegistry registry;

    address underwriter = address(0xA11CE);
    address buyer = address(0xB0B);
    address reporter = address(0xC0FFEE);
    /// @dev Stands in for Chainlink's KeystoneForwarder on Monad testnet.
    address forwarder = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
    address stranger = address(0xDEADBEEF);

    uint256 constant MIN_STAKE = 0.01 ether;
    uint256 constant CAPITAL = 100 ether;
    uint256 constant YEAR = 365 days;
    uint256 constant AGENT = 10182;

    function setUp() public {
        registry = new IncidentRegistry(address(0), MIN_STAKE);
        score = new RiskScore(address(registry));
        pool = new CoverPool(address(registry), address(score));
        trigger = new ParametricTrigger(address(pool), address(score), address(registry), forwarder);
        // The pool only lets the authorised orchestrator execute a payout, so the
        // trigger must be wired before any payout can happen (as the deploy script
        // does).
        pool.setTrigger(address(trigger));

        vm.deal(underwriter, 1000 ether);
        vm.deal(buyer, 1000 ether);
        vm.deal(reporter, 1000 ether);

        vm.prank(underwriter);
        pool.deposit{value: CAPITAL}();
    }

    /// @dev Report an incident and let the challenge window pass so it is accepted.
    function _reportAndFinalize(uint256 agentId, uint8 severity) internal {
        vm.prank(reporter);
        uint256 id = registry.reportIncident{value: MIN_STAKE}(
            agentId, keccak256("SLA_BREACH"), severity, keccak256("evidence")
        );
        vm.warp(block.timestamp + 3 days + 1);
        registry.finalize(id);
    }

    /// @dev Buy the max coverage an agent is allowed, and return the policy id.
    function _buyMax(uint256 agentId) internal returns (uint256 policyId, uint256 amount) {
        (, uint256 maxCoverage,,) = pool.quotePremium(agentId, type(uint256).max, YEAR);
        (uint256 premium,,,) = pool.quotePremium(agentId, maxCoverage, YEAR);
        vm.prank(buyer);
        policyId = pool.buyCover{value: premium}(agentId, maxCoverage, YEAR);
        return (policyId, maxCoverage);
    }

    // ---------------------------------------------------------------------
    // No approval step exists
    // ---------------------------------------------------------------------

    function test_MetConditionPaysOutWithNoApprovalStep() public {
        _reportAndFinalize(AGENT, 5); // catastrophic -> low score
        score.recompute(AGENT);
        (uint256 policyId, uint256 amount) = _buyMax(AGENT);

        uint256 threshold = score.getScore(AGENT); // condition holds at or below this
        trigger.registerTrigger(policyId, AGENT, threshold, 1);

        uint256 before = buyer.balance;

        // A complete stranger triggers the payout. No owner, no committee, no vote.
        vm.prank(stranger);
        bool paid = trigger.evaluate(policyId);

        assertTrue(paid, "condition was met, so payout must fire");
        assertEq(buyer.balance, before + amount, "buyer received the coverage amount");
        assertTrue(trigger.getTrigger(policyId).fired);
    }

    function test_UnmetConditionDoesNotPay() public {
        _reportAndFinalize(AGENT, 1); // minor -> high score
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);

        // Threshold below the actual score: condition cannot hold.
        uint256 threshold = score.getScore(AGENT) - 1;
        trigger.registerTrigger(policyId, AGENT, threshold, 1);

        bool paid = trigger.evaluate(policyId);
        assertFalse(paid, "score is above the threshold, so no payout");
        assertFalse(trigger.getTrigger(policyId).fired);
    }

    function test_PayoutCannotHappenTwice() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, score.getScore(AGENT), 1);

        trigger.evaluate(policyId);
        vm.expectRevert(ParametricTrigger.AlreadyFired.selector);
        trigger.evaluate(policyId);
    }

    // ---------------------------------------------------------------------
    // The disclosure gate: no record, no payout
    // ---------------------------------------------------------------------

    function test_NoRecordMeansNoPayout_EvenIfScoreWouldQualify() public {
        // Buy coverage while silent, then register a trigger with a very loose
        // threshold. Even a threshold of 100 must not pay, because the agent has
        // never disclosed anything: there is no record to trigger against.
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, 100, 1);

        (bool met, uint256 s, uint256 accepted) = trigger.checkCondition(policyId);
        assertFalse(met, "no accepted incidents -> condition cannot hold");
        assertEq(s, 0, "no score is read when there is no record");
        assertEq(accepted, 0);

        bool paid = trigger.evaluate(policyId);
        assertFalse(paid, "silence must not collect a payout");
    }

    function test_RecordUnlocksThePayoutPath() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, score.getScore(AGENT), 2); // require 2

        // Only 1 accepted incident, so the requirement of 2 is not met.
        bool paid = trigger.evaluate(policyId);
        assertFalse(paid, "minAcceptedIncidents is a real gate");

        // A second incident satisfies it.
        _reportAndFinalize(AGENT, 3);
        score.recompute(AGENT);
        paid = trigger.evaluate(policyId);
        assertTrue(paid, "second accepted incident unlocks the payout");
    }

    // ---------------------------------------------------------------------
    // The CRE path cannot mint an undeserved payout
    // ---------------------------------------------------------------------

    function test_OnlyTheForwarderMayCallOnReport() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, score.getScore(AGENT), 1);

        bytes memory report = abi.encode(policyId, true, uint256(0), uint256(1));

        // A stranger claiming the condition is met must be rejected outright.
        vm.prank(stranger);
        vm.expectRevert(ParametricTrigger.NotForwarder.selector);
        trigger.onReport("", report);
    }

    /// @dev The important one. The forwarder is trusted to deliver a report, but
    ///      NOT trusted about whether the condition holds. A report that claims
    ///      `met = true` while on-chain state says otherwise must not pay out.
    function test_ForwarderCannotForceAPayoutThatStateDoesNotJustify() public {
        _reportAndFinalize(AGENT, 1); // minor -> high score
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);

        uint256 threshold = score.getScore(AGENT) - 1; // condition will NOT hold
        trigger.registerTrigger(policyId, AGENT, threshold, 1);

        // The report lies: met = true, score = 0.
        bytes memory lyingReport = abi.encode(policyId, true, uint256(0), uint256(1));

        uint256 before = buyer.balance;
        vm.prank(forwarder);
        trigger.onReport("", lyingReport);

        assertEq(buyer.balance, before, "a lying report must not move funds");
        assertFalse(trigger.getTrigger(policyId).fired, "trigger must remain unfired");
    }

    function test_ForwarderReportPaysWhenStateActuallyJustifiesIt() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, uint256 amount) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, score.getScore(AGENT), 1);

        bytes memory report = abi.encode(policyId, true, score.getScore(AGENT), uint256(1));

        uint256 before = buyer.balance;
        vm.prank(forwarder);
        trigger.onReport("", report);

        assertEq(buyer.balance, before + amount, "an honest report triggers the payout");
        assertTrue(trigger.getTrigger(policyId).fired);
    }

    function test_ForwarderReportForUnknownPolicyIsIgnored() public {
        bytes memory report = abi.encode(uint256(999), true, uint256(0), uint256(1));

        // Must not revert and must not pay: an unregistered policy is simply
        // not actionable, and the DON should not see a hard failure for it.
        vm.prank(forwarder);
        trigger.onReport("", report);

        assertEq(pool.policyCount(), 0);
    }

    // ---------------------------------------------------------------------
    // Registration rules
    // ---------------------------------------------------------------------

    function test_RegisterRequiresAnActivePolicy() public {
        // Policy id 0 does not exist yet, so the pool must say so by name rather
        // than panicking on an out-of-range array read.
        vm.expectRevert(abi.encodeWithSelector(CoverPool.PolicyNotFound.selector, uint256(0)));
        trigger.registerTrigger(0, AGENT, 50, 1);
    }

    function test_CannotRegisterTwice() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, 50, 1);

        vm.expectRevert(ParametricTrigger.TriggerAlreadyRegistered.selector);
        trigger.registerTrigger(policyId, AGENT, 60, 1);
    }

    /// @dev Security regression: the trigger's agent must be the policy's own
    ///      agent. Without this, an attacker registers a trigger for policy P
    ///      (agent 10182) while naming a different, low-scoring agent, making the
    ///      condition true and draining a pool policy that was never about it.
    function test_RegisterTrigger_RejectsAgentThatIsNotThePolicyAgent() public {
        uint256 constant_ATTACKER_AGENT = 999999;
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        assertEq(pool.getPolicy(policyId).agentId, AGENT, "policy is about AGENT");

        vm.expectRevert(
            abi.encodeWithSelector(ParametricTrigger.AgentMismatch.selector, AGENT, constant_ATTACKER_AGENT)
        );
        trigger.registerTrigger(policyId, constant_ATTACKER_AGENT, 100, 1);

        // And the legitimate registration still works, and records the policy's
        // own agent regardless of the caller passing it correctly.
        trigger.registerTrigger(policyId, AGENT, 50, 1);
        assertEq(trigger.getTrigger(policyId).agentId, AGENT);
    }

    function test_CheckConditionRevertsForUnregistered() public {
        vm.expectRevert(ParametricTrigger.TriggerNotRegistered.selector);
        trigger.checkCondition(123);
    }

    function test_RegisteredPoliciesAreEnumerable() public {
        _reportAndFinalize(AGENT, 5);
        score.recompute(AGENT);
        (uint256 policyId, ) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, 50, 1);

        assertEq(trigger.triggerCount(), 1);
        uint256[] memory ids = trigger.registeredPolicies();
        assertEq(ids.length, 1);
        assertEq(ids[0], policyId);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(ParametricTrigger.ZeroAddress.selector);
        new ParametricTrigger(address(0), address(score), address(registry), forwarder);
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    /// @dev A payout only ever moves the policy's own coverage amount, whatever
    ///      the report claims about score.
    function testFuzz_PayoutAmountIsBoundedByThePolicy(uint96 severityRaw, uint256 claimedScore) public {
        uint8 severity = uint8((uint256(severityRaw) % 5) + 1);
        _reportAndFinalize(AGENT, severity);
        score.recompute(AGENT);
        (uint256 policyId, uint256 amount) = _buyMax(AGENT);
        trigger.registerTrigger(policyId, AGENT, 100, 1); // loose: condition holds

        bytes memory report = abi.encode(policyId, true, claimedScore, uint256(1));

        uint256 before = buyer.balance;
        vm.prank(forwarder);
        trigger.onReport("", report);

        assertEq(buyer.balance - before, amount, "payout equals the policy amount, never the claim");
    }
}
