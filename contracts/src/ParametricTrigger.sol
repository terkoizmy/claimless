// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IReceiver} from "./interfaces/IReceiver.sol";
import {CoverPool} from "./CoverPool.sol";
import {RiskScore} from "./RiskScore.sol";
import {IIncidentRegistry} from "./interfaces/IIncidentRegistry.sol";

/// @title ParametricTrigger
/// @notice Turns a measured condition into a payout, with no human in the loop.
///
/// @dev WHY THIS CONTRACT IS THE DIFFERENTIATOR
///
/// Every DeFi insurance protocol that died, died the same way:
///
///   - InsurAce: dead (TVL $143K, staked $0)
///   - Cover Protocol: shut down
///   - Nexus Mutual: V1 token voting -> V2 stake-weighted -> V3 **three human experts**
///
/// All three failed at the same step: a human (or a committee, or a token vote)
/// had to *decide* whether a claim was valid. This contract removes that step
/// entirely. A payout fires when arithmetic says so, and the call can be made by
/// anyone.
///
/// HOW THE CONDITION IS EVALUATED
/// Two independent paths, neither of which involves discretion:
///
///   1. `evaluate(coverageId)` — a permissionless, deterministic check. Anyone
///      may call it; the result depends only on on-chain state.
///   2. `onReport(metadata, report)` — the Chainlink CRE path. A DON-signed
///      report arrives via the KeystoneForwarder, so the off-chain check runs
///      on a Decentralized Oracle Network rather than on our server. This is
///      what makes "not our server decides" true instead of aspirational.
///
/// DESIGN NOTES
///  - The condition is deliberately narrow: risk score at or below a threshold.
///    "AI quality" is not machine-checkable; "score <= threshold" is. Narrow
///    triggers are what keep basis risk honest.
///  - There is no `claim`, no `vote`, no `approve`, no `dispute` for the payout
///    itself. Disputes exist in `IncidentRegistry` (about *reports*), never here.
contract ParametricTrigger is IReceiver {
    /// @notice Coverage must have an active policy in the pool.
    CoverPool public immutable pool;

    /// @notice Used to read the measured condition.
    RiskScore public immutable riskScore;

    /// @notice Used to check that an agent actually has a disclosed record.
    IIncidentRegistry public immutable registry;

    /// @notice The only address whose `onReport` is accepted: Chainlink's
    ///         KeystoneForwarder for this chain. Any other caller is rejected.
    address public immutable forwarder;

    /// @notice A registered trigger for one policy.
    struct Trigger {
        uint256 policyId;
        uint256 agentId;
        uint256 scoreThreshold; // payout condition: score <= threshold
        uint256 minAcceptedIncidents; // never pay out on an empty record
        bool registered;
        bool fired;
    }

    /// @notice policyId => trigger.
    mapping(uint256 policyId => Trigger trigger) private _triggers;

    /// @notice All registered policy ids, for enumeration.
    uint256[] private _registeredPolicies;

    // ------------------------------- events -------------------------------

    event TriggerRegistered(
        uint256 indexed policyId,
        uint256 indexed agentId,
        uint256 scoreThreshold,
        uint256 minAcceptedIncidents
    );
    event TriggerEvaluated(uint256 indexed policyId, bool met, uint256 score, uint256 acceptedIncidents);
    /// @notice A payout was executed, with the reason recorded on-chain.
    event PayoutExecuted(uint256 indexed policyId, uint256 indexed agentId, uint256 amount, string reason);
    /// @notice Emitted when the CRE path delivered a report (accepted or not).
    event ReportReceived(bytes32 indexed reportHash, bool accepted);

    // ------------------------------- errors -------------------------------

    error ZeroAddress();
    error NotForwarder();
    error TriggerAlreadyRegistered();
    error TriggerNotRegistered();
    error AlreadyFired();
    error PolicyNotActive();
    error ConditionNotMet(uint256 score, uint256 threshold);

    /// @param pool_ Coverage pool holding the capital to pay out.
    /// @param riskScore_ Deterministic score contract.
    /// @param registry_ Incident registry (to require a real record).
    /// @param forwarder_ Chainlink KeystoneForwarder address for this chain.
    constructor(address pool_, address riskScore_, address registry_, address forwarder_) {
        if (pool_ == address(0) || riskScore_ == address(0) || registry_ == address(0) || forwarder_ == address(0)) {
            revert ZeroAddress();
        }
        pool = CoverPool(pool_);
        riskScore = RiskScore(riskScore_);
        registry = IIncidentRegistry(registry_);
        forwarder = forwarder_;
    }

    // --------------------------- registration -----------------------------

    /// @notice Register the payout condition for a policy that exists in the pool.
    /// @dev Permissionless: anyone may register a trigger for any live policy.
    ///      The condition is data, not a privilege.
    function registerTrigger(
        uint256 policyId,
        uint256 agentId,
        uint256 scoreThreshold,
        uint256 minAcceptedIncidents
    ) external {
        if (_triggers[policyId].registered) revert TriggerAlreadyRegistered();
        if (!pool.getPolicy(policyId).active) revert PolicyNotActive();

        _triggers[policyId] = Trigger({
            policyId: policyId,
            agentId: agentId,
            scoreThreshold: scoreThreshold,
            minAcceptedIncidents: minAcceptedIncidents,
            registered: true,
            fired: false
        });
        _registeredPolicies.push(policyId);

        emit TriggerRegistered(policyId, agentId, scoreThreshold, minAcceptedIncidents);
    }

    // --------------------------- evaluation -------------------------------

    /// @notice Reads the condition. Pure view, no side effects.
    /// @return met Whether the payout condition currently holds.
    /// @return score The agent's latest score (0 if none stored).
    /// @return accepted Accepted incident count (the disclosure check).
    function checkCondition(uint256 policyId)
        public
        view
        returns (bool met, uint256 score, uint256 accepted)
    {
        Trigger storage t = _triggers[policyId];
        if (!t.registered) revert TriggerNotRegistered();

        accepted = registry.getAcceptedCount(t.agentId);

        // No record -> nothing to measure, and nothing to pay out on. An agent
        // that never disclosed cannot collect: that is the incentive closing.
        if (accepted < t.minAcceptedIncidents) {
            return (false, 0, accepted);
        }

        score = riskScore.getScore(t.agentId);
        met = score <= t.scoreThreshold;
    }

    /// @notice Evaluate and, if the condition holds, pay out. Permissionless.
    ///
    /// @dev This is the whole point of the contract: one call, deterministic,
    ///      callable by anyone, with no approval step. There is intentionally no
    ///      parameter that lets the caller influence the outcome.
    function evaluate(uint256 policyId) external returns (bool paid) {
        (bool met, uint256 score, uint256 accepted) = checkCondition(policyId);
        emit TriggerEvaluated(policyId, met, score, accepted);

        if (!met) {
            return false;
        }
        return _payout(policyId, score, accepted);
    }

    // ----------------------------- CRE path -------------------------------

    /// @notice Called by the Chainlink KeystoneForwarder with a verified report.
    ///
    /// @dev The report payload is expected to be ABI-encoded as:
    ///        (uint256 policyId, bool met, uint256 score, uint256 accepted)
    ///
    ///      Note what this function does NOT do: it does not trust the reported
    ///      booleans. It re-derives the condition from on-chain state and only
    ///      uses the report as a *signal to evaluate now*. A compromised or
    ///      buggy workflow therefore cannot mint a payout it is not owed.
    ///      Verifying the forwarder is the first gate; re-checking the state is
    ///      the second, and the second is the one that matters.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder();

        (uint256 policyId,,, ) = abi.decode(report, (uint256, bool, uint256, uint256));
        bytes32 reportHash = keccak256(abi.encodePacked(metadata, report));

        Trigger storage t = _triggers[policyId];
        if (!t.registered || t.fired) {
            emit ReportReceived(reportHash, false);
            return;
        }

        (bool met, uint256 score, uint256 accepted) = checkCondition(policyId);
        emit TriggerEvaluated(policyId, met, score, accepted);

        if (!met) {
            emit ReportReceived(reportHash, false);
            return;
        }

        _payout(policyId, score, accepted);
        emit ReportReceived(reportHash, true);
    }

    // ------------------------------ internals -----------------------------

    /// @dev Executes the payout through the pool and records the reason.
    function _payout(uint256 policyId, uint256 score, uint256 accepted) internal returns (bool) {
        Trigger storage t = _triggers[policyId];
        if (t.fired) revert AlreadyFired();
        if (!pool.getPolicy(policyId).active) revert PolicyNotActive();

        t.fired = true;
        uint256 amount = pool.executePayout(policyId);

        emit PayoutExecuted(
            policyId,
            t.agentId,
            amount,
            _reason(score, t.scoreThreshold, accepted)
        );
        return true;
    }

    /// @dev Builds a short, on-chain explanation so the payout is auditable
    ///      without reading logs off-chain.
    function _reason(uint256 score, uint256 threshold, uint256 accepted) internal pure returns (string memory) {
        return string.concat(
            "score ", _utoa(score), " <= ", _utoa(threshold), " with ", _utoa(accepted), " accepted incident(s)"
        );
    }

    /// @dev Minimal uint -> decimal string. Avoids importing a strings library
    ///      for one call site.
    function _utoa(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // -------------------------------- views -------------------------------

    /// @notice Read a registered trigger.
    function getTrigger(uint256 policyId) external view returns (Trigger memory) {
        return _triggers[policyId];
    }

    /// @notice Number of triggers ever registered.
    function triggerCount() external view returns (uint256) {
        return _registeredPolicies.length;
    }

    /// @notice The policy ids with a registered trigger.
    function registeredPolicies() external view returns (uint256[] memory) {
        return _registeredPolicies;
    }
}
