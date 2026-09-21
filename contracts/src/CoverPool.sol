// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIncidentRegistry} from "./interfaces/IIncidentRegistry.sol";
import {RiskScore} from "./RiskScore.sol";

/// @title CoverPool
/// @notice Underwriter capital pool for parametric agent coverage.
///
/// @dev WHY THIS CONTRACT IS THE COLD-START FIX
///
/// The problem we measured: ERC-8004 has ~828k agents registered and essentially
/// zero reputation feedback (docs/ERC8004_COLDSTART_FINDINGS.md). Registration is
/// solved; *disclosure* is not. Two of the three causes of silence are economic:
///
///   1. reporting is optional, and
///   2. skipping it is unpunished.
///
/// This contract prices the silence instead of punishing it. An agent with no
/// disclosed record can still buy coverage, but at a punitive premium and a
/// hard-capped amount. The moment it discloses, its terms improve.
///
/// DECIDED 2026-09-21: never a hard rejection. A blanket refusal gives a new
/// agent no reason to ever return and creates no record. Priced coverage creates
/// a first purchase, which creates the record, which unlocks better terms.
///
/// Note the deliberate asymmetry: a *disclosed bad* record is still cheaper than
/// *no* record. That is the incentive we want.
///
/// WHY THIS IS NOT "INSURANCE" (regulatory, and honest)
/// It is a parametric coverage prototype on testnet. Payout is triggered by a
/// measurable condition, never by a claim or a committee. See docs/INCENTIVE_MECHANISM_DESIGN.md.
contract CoverPool {
    // ---------------------------------------------------------------------
    // Pricing model (deterministic, re-derivable by anyone)
    //
    //   premium = amount * duration / 365 days * baseRate * riskMultiplier
    //
    //   where riskMultiplier grows as the score falls:
    //       score 100..90 -> 1x        (multiplier 10_000, i.e. 1.00x)
    //       score  89..80 -> 1.5x
    //       score  79..60 -> 2x
    //       score  59..40 -> 3x
    //       score  39..1  -> 5x
    //       no record     -> 5x  AND amount hard-capped (see NO_RECORD_MAX_BPS)
    //
    //   Multipliers use 1e4 fixed point so they are integers on-chain.
    //
    // Everything here is arithmetic. No oracle, no discretion, no admin override
    // of an individual quote.
    // ---------------------------------------------------------------------

    /// @notice Base annual rate in 1e4 fixed point (100 = 1.00%/year).
    uint256 public constant BASE_RATE_BPS = 100;

    /// @notice Fixed-point denominator for multipliers.
    uint256 public constant MULTIPLIER_DENOM = 10_000;

    /// @notice Premium multiplier when the agent has NO disclosed record.
    /// @dev 5x the best tier: silence is expensive, but never fatal.
    uint256 public constant NO_RECORD_MULTIPLIER = 50_000; // 5.00x

    /// @notice Max coverage an agent with no record may buy, in bps of the
    ///         normal per-policy cap. 1000 = 10%.
    uint256 public constant NO_RECORD_MAX_BPS = 1_000;

    /// @notice Normal per-policy cap as a fraction of pool capacity, in bps.
    /// @dev 2000 = 20% of total capacity, so one policy cannot drain the pool.
    uint256 public constant NORMAL_MAX_CAPACITY_BPS = 2_000;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant DAYS_365 = 365 days;

    /// @notice The registry used to decide whether an agent has a record.
    IIncidentRegistry public immutable registry;

    /// @notice The score used to price a policy.
    RiskScore public immutable riskScore;

    /// @notice Deployer. May authorise the payout orchestrator exactly once.
    address public owner;

    /// @notice The only address allowed to execute a payout: the orchestrator
    ///         (ParametricTrigger, driven by Chainlink CRE). Set once by the
    ///         owner after both contracts exist, because the pool is deployed
    ///         before the trigger.
    address public trigger;

    /// @notice Total underwriter capital currently available to back policies.
    uint256 public totalCapital;

    /// @notice Capital already committed to active policies.
    uint256 public lockedCapital;

    /// @notice Underwriter balances (deposits minus withdrawals).
    mapping(address underwriter => uint256 balance) public underwriterBalance;

    /// @notice A purchased policy.
    struct Policy {
        uint256 id;
        uint256 agentId;
        address buyer;
        uint256 amount; // coverage amount
        uint256 premium; // paid up-front
        uint40 startAt;
        uint40 endAt;
        bool active;
    }

    /// @notice All policies ever purchased.
    Policy[] private _policies;

    /// @notice agentId => active coverage amount across all its policies.
    mapping(uint256 agentId => uint256 covered) public coverageOf;

    /// @notice Premiums collected but not yet paid out.
    uint256 public premiumsCollected;

    // ------------------------------- events -------------------------------

    event Deposited(address indexed underwriter, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed underwriter, uint256 amount, uint256 newBalance);
    event CoverPurchased(
        uint256 indexed policyId,
        uint256 indexed agentId,
        address indexed buyer,
        uint256 amount,
        uint256 premium,
        uint256 riskMultiplier,
        bool hadRecord
    );
    /// @notice Emitted ONLY for genuinely invalid requests (unknown agent,
    ///         insufficient capacity). Never for a missing risk record.
    event CoverRefused(uint256 indexed agentId, address indexed buyer, bytes32 reason);
    event PayoutExecuted(uint256 indexed policyId, uint256 indexed agentId, uint256 amount);
    /// @notice Emitted once when the owner authorises the payout orchestrator.
    event TriggerAuthorised(address indexed trigger);

    // ------------------------------- errors -------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientCapacity(uint256 requested, uint256 available);
    error ExceedsPolicyCap(uint256 requested, uint256 cap);
    error UnknownAgent();
    error PremiumNotPaid(uint256 required, uint256 sent);
    error NoBalance();
    error StillLocked();
    error PolicyNotActive();
    error PolicyNotFound(uint256 policyId);
    error NotTriggerAuthorised();
    error NotOwner();
    error AlreadyConfigured();

    /// @param registry_ Staked incident registry (determines "has a record").
    /// @param riskScore_ The deterministic score contract.
    constructor(address registry_, address riskScore_) {
        if (registry_ == address(0) || riskScore_ == address(0)) revert ZeroAddress();
        registry = IIncidentRegistry(registry_);
        riskScore = RiskScore(riskScore_);
        owner = msg.sender;
    }

    /// @notice Authorise the payout orchestrator. Owner-only, and only once, so
    ///         the payout path cannot later be repointed at a new contract.
    /// @dev Called after ParametricTrigger is deployed (the pool exists first).
    function setTrigger(address trigger_) external {
        if (msg.sender != owner) revert NotOwner();
        if (trigger != address(0)) revert AlreadyConfigured();
        if (trigger_ == address(0)) revert ZeroAddress();
        trigger = trigger_;
        emit TriggerAuthorised(trigger_);
    }

    // ----------------------------- underwriting ---------------------------

    /// @notice Deposit capital to back policies.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        underwriterBalance[msg.sender] += msg.value;
        totalCapital += msg.value;
        emit Deposited(msg.sender, msg.value, underwriterBalance[msg.sender]);
    }

    /// @notice Withdraw capital that is not backing active policies.
    /// @dev Only *unlocked* capital can leave; locked capital is backing live
    ///      policies and must stay until they expire.
    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (underwriterBalance[msg.sender] < amount) revert NoBalance();

        uint256 free = totalCapital - lockedCapital;
        if (amount > free) revert StillLocked();

        underwriterBalance[msg.sender] -= amount;
        totalCapital -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NoBalance();
        emit Withdrawn(msg.sender, amount, underwriterBalance[msg.sender]);
    }

    // ------------------------------- pricing ------------------------------

    /// @notice Maps a risk score to a premium multiplier (1e4 fixed point).
    /// @dev Pure and public so any party can re-derive a quote off-chain.
    function multiplierForScore(uint256 score) public pure returns (uint256) {
        if (score >= 90) return 10_000; // 1.00x
        if (score >= 80) return 15_000; // 1.50x
        if (score >= 60) return 20_000; // 2.00x
        if (score >= 40) return 30_000; // 3.00x
        return 50_000; // 5.00x
    }

    /// @notice Whether the agent has any accepted incident on record.
    /// @dev This is the disclosure test. It reads the registry directly; there
    ///      is no off-chain input and no admin discretion.
    function _hasRecord(uint256 agentId) internal view returns (bool) {
        return registry.getAcceptedCount(agentId) > 0;
    }

    /// @notice Quotes a policy without buying it.
    /// @dev The premium is computed for the **effective** amount, i.e.
    ///      `min(amount, maxCoverage)`. Quoting the requested amount instead
    ///      would return a price the buyer cannot actually pay, which is a trap.
    ///      `maxCoverage` tells the caller what that effective amount is.
    /// @return premium The premium payable for `min(amount, maxCoverage)`.
    /// @return maxCoverage The largest amount this agent may buy right now.
    /// @return hadRecord Whether the agent has disclosed anything.
    /// @return riskMultiplier The multiplier applied (1e4 fixed point).
    function quotePremium(uint256 agentId, uint256 amount, uint256 duration)
        public
        view
        returns (uint256 premium, uint256 maxCoverage, bool hadRecord, uint256 riskMultiplier)
    {
        hadRecord = _hasRecord(agentId);

        // Unknown agent (id 0) is genuinely invalid, not merely silent.
        // Return early with a zero quote rather than pretending to price it.
        if (agentId == 0) {
            return (0, 0, hadRecord, 0);
        }

        uint256 score = hadRecord ? riskScore.getScore(agentId) : 0;
        riskMultiplier = hadRecord ? multiplierForScore(score) : NO_RECORD_MULTIPLIER;

        // The cap is where silence actually bites.
        uint256 normalCap = (totalCapital * NORMAL_MAX_CAPACITY_BPS) / BPS_DENOM;
        maxCoverage = hadRecord ? normalCap : (normalCap * NO_RECORD_MAX_BPS) / BPS_DENOM;

        // Price what the buyer can actually get, not what they asked for.
        uint256 effective = amount < maxCoverage ? amount : maxCoverage;

        // premium = effective * (duration/365d) * baseRate * multiplier
        premium = (effective * duration * BASE_RATE_BPS * riskMultiplier)
            / (DAYS_365 * BPS_DENOM * MULTIPLIER_DENOM);
    }

    /// @notice Buy coverage for an agent. Requires a risk record to get the
    ///         normal terms; without one, coverage is capped and expensive.
    /// @dev Never reverts for a missing record. See the contract header.
    function buyCover(uint256 agentId, uint256 amount, uint256 duration) external payable returns (uint256 policyId) {
        if (agentId == 0) revert UnknownAgent();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0) revert ZeroAmount();

        (uint256 premium, uint256 maxCoverage, bool hadRecord, uint256 mult) =
            quotePremium(agentId, amount, duration);

        // Hard cap is the punishment for silence. Refusal would only happen here
        // if the *requested* amount exceeds what the agent is allowed.
        if (amount > maxCoverage) {
            emit CoverRefused(agentId, msg.sender, keccak256("EXCEEDS_CAP"));
            revert ExceedsPolicyCap(amount, maxCoverage);
        }

        uint256 available = totalCapital - lockedCapital;
        if (amount > available) {
            emit CoverRefused(agentId, msg.sender, keccak256("INSUFFICIENT_CAPACITY"));
            revert InsufficientCapacity(amount, available);
        }

        if (msg.value != premium) revert PremiumNotPaid(premium, msg.value);

        policyId = _policies.length;
        _policies.push(
            Policy({
                id: policyId,
                agentId: agentId,
                buyer: msg.sender,
                amount: amount,
                premium: premium,
                startAt: uint40(block.timestamp),
                endAt: uint40(block.timestamp + duration),
                active: true
            })
        );

        lockedCapital += amount;
        coverageOf[agentId] += amount;
        premiumsCollected += premium;

        emit CoverPurchased(policyId, agentId, msg.sender, amount, premium, mult, hadRecord);
    }

    // ------------------------------- payout -------------------------------

    /// @notice Execute a payout. Called only by the authorised orchestrator
    ///         (ParametricTrigger, driven by Chainlink CRE), never by a claim or
    ///         a vote.
    /// @dev There is no `approve`/`vote`/`resolve` step anywhere in this
    ///      contract. That omission is the point: it is the mistake that killed
    ///      InsurAce and Cover Protocol and that Nexus Mutual retreated from.
    ///      The gate here is *who may call*, not *whether to pay*: the decision
    ///      is made by the trigger's on-chain condition.
    function executePayout(uint256 policyId) external returns (uint256 paid) {
        if (msg.sender != trigger) revert NotTriggerAuthorised();
        Policy storage p = _policies[policyId];
        if (!p.active) revert PolicyNotActive();

        p.active = false;
        lockedCapital -= p.amount;
        coverageOf[p.agentId] -= p.amount;
        paid = p.amount;

        (bool ok,) = p.buyer.call{value: paid}("");
        if (!ok) revert NoBalance();

        emit PayoutExecuted(policyId, p.agentId, paid);
    }

    // ------------------------------- views --------------------------------

    /// @notice Number of policies ever purchased.
    function policyCount() external view returns (uint256) {
        return _policies.length;
    }

    /// @notice Read one policy.
    /// @dev Reverts with a named error rather than an array panic when the id is
    ///      out of range, so callers (and other contracts) get a clear signal.
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        if (policyId >= _policies.length) revert PolicyNotFound(policyId);
        return _policies[policyId];
    }

    /// @notice Capital available to back new policies.
    function getCapacity() external view returns (uint256) {
        return totalCapital - lockedCapital;
    }
}
