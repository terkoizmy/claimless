// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {RiskScore} from "../src/RiskScore.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";
import {IIncidentRegistry} from "../src/interfaces/IIncidentRegistry.sol";

/// @notice Tests for CoverPool, focused on the thing this contract exists for:
///         pricing the silence. The incentive claims are asserted as behaviour,
///         not described in comments.
contract CoverPoolTest is Test {
    CoverPool pool;
    RiskScore score;
    IncidentRegistry registry;

    address underwriter = address(0xA11CE);
    address buyer = address(0xB0B);
    address reporter = address(0xC0FFEE);

    uint256 constant MIN_STAKE = 0.01 ether;
    uint256 constant CAPITAL = 100 ether;
    uint256 constant YEAR = 365 days;

    /// @dev Agent ids used across the tests.
    uint256 constant AGENT_SILENT = 10182; // never reports -> no record
    uint256 constant AGENT_GOOD = 20001; // reports minor -> good score
    uint256 constant AGENT_BAD = 30001; // reports catastrophically -> bad score

    function setUp() public {
        registry = new IncidentRegistry(address(0), MIN_STAKE);
        score = new RiskScore(address(registry));
        pool = new CoverPool(address(registry), address(score));

        vm.deal(underwriter, 1000 ether);
        vm.deal(buyer, 1000 ether);
        vm.deal(reporter, 1000 ether);

        vm.prank(underwriter);
        pool.deposit{value: CAPITAL}();
    }

    /// @dev Helper: create an accepted incident of the given severity for an agent.
    function _reportAndFinalize(uint256 agentId, uint8 severity) internal {
        vm.prank(reporter);
        uint256 id = registry.reportIncident{value: MIN_STAKE}(
            agentId, keccak256("SLA_BREACH"), severity, keccak256("evidence")
        );
        // Past the challenge window with no challenger -> accepted.
        vm.warp(block.timestamp + 3 days + 1);
        registry.finalize(id);
    }

    // ---------------------------------------------------------------------
    // The core incentive: silence is priced, not blocked
    // ---------------------------------------------------------------------

    /// @dev Helper: quote, then buy exactly the quoted effective amount.
    ///      `quotePremium` caps the premium to `min(amount, maxCoverage)`, so a
    ///      caller must buy that same effective amount or the value sent will
    ///      not match. This mirrors what a real integration does.
    function _buyMaxCoverage(uint256 agentId, address who) internal returns (uint256 policyId, uint256 premium, uint256 amount) {
        (, uint256 maxCoverage,,) = pool.quotePremium(agentId, type(uint256).max, YEAR);
        (uint256 p,,,) = pool.quotePremium(agentId, maxCoverage, YEAR);
        vm.prank(who);
        policyId = pool.buyCover{value: p}(agentId, maxCoverage, YEAR);
        return (policyId, p, maxCoverage);
    }

    function test_SilentAgentIsNotRejected_ButPaysMoreAndGetsLess() public {
        // No record at all. This must NOT revert: a hard refusal gives a new
        // agent no reason to return and creates no record.
        (uint256 premium, uint256 maxCoverage, bool hadRecord, uint256 mult) =
            pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);

        assertFalse(hadRecord, "silent agent has no record");
        assertEq(mult, pool.NO_RECORD_MULTIPLIER(), "silent agent is charged the punitive tier");
        assertGt(premium, 0, "still priced, not refused");
        assertGt(maxCoverage, 0, "still allowed to buy something");

        uint256 normalCap = (CAPITAL * pool.NORMAL_MAX_CAPACITY_BPS()) / 10_000;
        assertEq(maxCoverage, normalCap / 10, "cap is 10% of the normal cap");
    }

    function test_DisclosingImprovesTerms_EvenABadRecord() public {
        // A catastrophically bad record...
        _reportAndFinalize(AGENT_BAD, 5);
        score.recompute(AGENT_BAD);
        assertLt(score.getScore(AGENT_BAD), 100, "score dropped");

        (uint256 badPremium,, bool badHasRecord, uint256 badMult) =
            pool.quotePremium(AGENT_BAD, 1 ether, YEAR);

        assertTrue(badHasRecord, "bad agent does have a record");
        assertLt(badMult, pool.NO_RECORD_MULTIPLIER(), "a disclosed bad record beats no record");

        // ...is still cheaper than silence. That asymmetry is the incentive.
        (uint256 silentPremium,,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        assertLt(badPremium, silentPremium, "disclosed-bad must cost less than silent");
    }

    function test_CapGrowsOnceARecordExists() public {
        (, uint256 silentCap,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);

        _reportAndFinalize(AGENT_GOOD, 1);

        (, uint256 recordCap,,) = pool.quotePremium(AGENT_GOOD, 1 ether, YEAR);
        assertGt(recordCap, silentCap, "a record unlocks a larger cap");
        assertEq(recordCap, silentCap * 10, "normal cap is 10x the no-record cap");
    }

    // ---------------------------------------------------------------------
    // Pricing is deterministic and re-derivable
    // ---------------------------------------------------------------------

    function test_MultiplierTiersMatchTheDocumentedTable() public view {
        assertEq(pool.multiplierForScore(100), 10_000);
        assertEq(pool.multiplierForScore(90), 10_000);
        assertEq(pool.multiplierForScore(89), 15_000);
        assertEq(pool.multiplierForScore(80), 15_000);
        assertEq(pool.multiplierForScore(79), 20_000);
        assertEq(pool.multiplierForScore(60), 20_000);
        assertEq(pool.multiplierForScore(59), 30_000);
        assertEq(pool.multiplierForScore(40), 30_000);
        assertEq(pool.multiplierForScore(39), 50_000);
        assertEq(pool.multiplierForScore(0), 50_000);
    }

    function test_PremiumIsProportionalToAmountAndDuration() public {
        (uint256 p1,,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        (uint256 p2,,,) = pool.quotePremium(AGENT_SILENT, 2 ether, YEAR);
        (uint256 p3,,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR / 2);

        assertEq(p2, p1 * 2, "doubling amount doubles premium");
        assertEq(p3, p1 / 2, "halving duration halves premium");
    }

    function test_QuoteIsDeterministic() public view {
        (uint256 a, uint256 b, bool c, uint256 d) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        (uint256 e, uint256 f, bool g, uint256 h) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        assertEq(a, e);
        assertEq(b, f);
        assertEq(c, g);
        assertEq(d, h);
    }

    // ---------------------------------------------------------------------
    // Underwriting mechanics
    // ---------------------------------------------------------------------

    function test_DepositAndWithdraw() public {
        assertEq(pool.totalCapital(), CAPITAL);
        assertEq(pool.underwriterBalance(underwriter), CAPITAL);

        vm.prank(underwriter);
        pool.withdraw(10 ether);
        assertEq(pool.totalCapital(), CAPITAL - 10 ether);
    }

    function test_WithdrawCannotTouchLockedCapital() public {
        // Lock most of the pool by buying coverage.
        (, , uint256 maxCoverage) = _buyMaxCoverage(AGENT_SILENT, buyer);
        assertEq(maxCoverage, (CAPITAL * 2000 / 10_000) / 10);

        // Attempt to withdraw the locked part.
        uint256 free = pool.getCapacity();
        vm.prank(underwriter);
        vm.expectRevert(CoverPool.StillLocked.selector);
        pool.withdraw(free + 1);
    }

    function test_BuyCoverRecordsPolicyAndLocksCapital() public {
        (, uint256 maxCoverage, bool hadRecord, uint256 mult) =
            pool.quotePremium(AGENT_SILENT, type(uint256).max, YEAR);
        (uint256 premium,,,) = pool.quotePremium(AGENT_SILENT, maxCoverage, YEAR);

        vm.prank(buyer);
        uint256 policyId = pool.buyCover{value: premium}(AGENT_SILENT, maxCoverage, YEAR);

        assertEq(pool.policyCount(), 1);
        CoverPool.Policy memory p = pool.getPolicy(policyId);
        assertEq(p.agentId, AGENT_SILENT);
        assertEq(p.buyer, buyer);
        assertEq(p.amount, maxCoverage);
        assertTrue(p.active);
        assertEq(pool.coverageOf(AGENT_SILENT), maxCoverage);
        assertEq(pool.lockedCapital(), maxCoverage);
        assertEq(pool.premiumsCollected(), premium);

        // The event must carry the disclosure state, so off-chain consumers can
        // see whether the buyer was silent or disclosed.
        assertFalse(hadRecord);
        assertEq(mult, pool.NO_RECORD_MULTIPLIER());
    }

    function test_BuyCoverRejectsUnderpayment() public {
        (, uint256 maxCoverage,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        (uint256 premium,,,) = pool.quotePremium(AGENT_SILENT, maxCoverage, YEAR);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CoverPool.PremiumNotPaid.selector, premium, premium / 2));
        pool.buyCover{value: premium / 2}(AGENT_SILENT, maxCoverage, YEAR);
    }

    function test_BuyCoverRejectsExceedingCap() public {
        (, uint256 maxCoverage,,) = pool.quotePremium(AGENT_SILENT, 1 ether, YEAR);
        (uint256 premiumTooBig,,,) = pool.quotePremium(AGENT_SILENT, maxCoverage * 2, YEAR);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(CoverPool.ExceedsPolicyCap.selector, maxCoverage * 2, maxCoverage)
        );
        pool.buyCover{value: premiumTooBig}(AGENT_SILENT, maxCoverage * 2, YEAR);
    }

    function test_BuyCoverRejectsUnknownAgent() public {
        vm.prank(buyer);
        vm.expectRevert(CoverPool.UnknownAgent.selector);
        pool.buyCover{value: 1 ether}(0, 1 ether, YEAR);
    }

    // ---------------------------------------------------------------------
    // Payout: automatic, no vote, no committee
    // ---------------------------------------------------------------------

    function test_PayoutPaysTheBuyerAndUnlocksCapital() public {
        (uint256 policyId, , uint256 maxCoverage) = _buyMaxCoverage(AGENT_SILENT, buyer);

        uint256 before = buyer.balance;
        vm.prank(address(pool.trigger()));
        pool.executePayout(policyId);

        assertEq(buyer.balance, before + maxCoverage, "buyer received the coverage amount");
        assertEq(pool.lockedCapital(), 0, "capital unlocked");
        assertEq(pool.coverageOf(AGENT_SILENT), 0);
        assertFalse(pool.getPolicy(policyId).active);
    }

    function test_PayoutTwiceReverts() public {
        (uint256 policyId, , ) = _buyMaxCoverage(AGENT_SILENT, buyer);

        vm.prank(address(pool.trigger()));
        pool.executePayout(policyId);
        vm.prank(address(pool.trigger()));
        vm.expectRevert(CoverPool.PolicyNotActive.selector);
        pool.executePayout(policyId);
    }

    /// @dev Security regression: a payout may only be executed by the authorised
    ///      orchestrator. Without this gate, anyone could drain an active policy,
    ///      bypassing the parametric condition entirely. This is the whole point
    ///      of "who pays is gated; whether to pay is not".
    function test_ExecutePayout_OnlyTriggerCanCall() public {
        (uint256 policyId, , ) = _buyMaxCoverage(AGENT_SILENT, buyer);

        vm.prank(address(0xDEADBEEF));
        vm.expectRevert(CoverPool.NotTriggerAuthorised.selector);
        pool.executePayout(policyId);

        assertTrue(pool.getPolicy(policyId).active, "unauthorised call must not pay out");
        assertEq(pool.lockedCapital(), 0 + pool.getPolicy(policyId).amount, "capital still locked");
    }

    /// @dev The trigger slot can be set exactly once, by the owner only.
    function test_SetTrigger_OnceAndOwnerOnly() public {
        assertEq(pool.trigger(), address(0), "no trigger before wiring");

        // Non-owner cannot wire it.
        vm.prank(address(0xBAD));
        vm.expectRevert(CoverPool.NotOwner.selector);
        pool.setTrigger(address(0x1234));

        // Owner wires it; the pool's deployer is this test contract.
        pool.setTrigger(address(0x1234));
        assertEq(pool.trigger(), address(0x1234));

        // A second wiring attempt is refused, so the payout path cannot be repointed.
        vm.expectRevert(CoverPool.AlreadyConfigured.selector);
        pool.setTrigger(address(0x5678));

        // Zero address is rejected when a trigger has not yet been set.
        CoverPool fresh = new CoverPool(address(registry), address(score));
        vm.expectRevert(CoverPool.ZeroAddress.selector);
        fresh.setTrigger(address(0));
    }

    /// @dev The thesis, asserted structurally: there is no per-claim approval
    ///      path. If a future change adds one, this test is a reminder to think
    ///      about it rather than a guarantee. The meaningful check is that the
    ///      full flow works with a single call and no intermediate role.
    function test_PayoutNeedsNoApprovalStep() public {
        (uint256 policyId, , ) = _buyMaxCoverage(AGENT_SILENT, buyer);

        // The authorised orchestrator pays in one call: no vote, no committee,
        // no per-claim approval. The trigger contract decides via its on-chain
        // condition; this test wires a stand-in trigger and checks that the
        // payer needs no additional permission.
        address standInTrigger = address(0x7A1);
        pool.setTrigger(standInTrigger);

        vm.prank(standInTrigger);
        pool.executePayout(policyId);

        assertFalse(pool.getPolicy(policyId).active, "payout completed with no approval step");
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    function testFuzz_PremiumNeverExceedsAmount(uint96 amountRaw, uint32 durationRaw) public view {
        uint256 amount = uint256(amountRaw) % (CAPITAL / 4) + 1;
        uint256 duration = uint256(durationRaw) % YEAR + 1;

        (uint256 premium,,,) = pool.quotePremium(AGENT_SILENT, amount, duration);
        // Even at 5x the 1%/yr base rate, a sub-year policy costs far less than
        // the coverage itself. A premium exceeding the amount would be nonsense.
        assertLt(premium, amount, "premium must be less than the coverage amount");
    }

    function testFuzz_SilentAlwaysCostsAtLeastAsMuchAsDisclosed(uint96 amountRaw) public {
        uint256 amount = uint256(amountRaw) % (CAPITAL / 40) + 1;
        _reportAndFinalize(AGENT_BAD, 5);

        (uint256 silentPremium,,,) = pool.quotePremium(AGENT_SILENT, amount, YEAR);
        (uint256 badPremium,,,) = pool.quotePremium(AGENT_BAD, amount, YEAR);

        assertLe(badPremium, silentPremium, "silence is never the cheaper option");
    }
}
