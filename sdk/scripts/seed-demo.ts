/**
 * seed-demo.ts — restore the Claimless demo state on the CANONICAL deployment.
 *
 * WHY THIS EXISTS
 * The Sep 21 redeploy (commit 3658913) created a fresh contract set that
 * includes CoverPool and ParametricTrigger, but the demo state (accepted
 * incidents, a purchased policy, a registered trigger, the ERC-8004 summary)
 * stayed on the pre-redeploy addresses. Every read path (dashboard, SDK
 * verify, CRE config) now points at the new set, so it rendered an empty world.
 *
 * This script rebuilds that state deterministically and is safe to re-run:
 * every step is guarded by an on-chain precondition, and a fresh policy is
 * only bought when the previous one has already fired.
 *
 * DEMO CAST (three-way contrast)
 *   10182  has a disclosed, accepted record  -> normal terms, CRE-featured,
 *          and the parametric trigger fires (payout with no claim, no vote).
 *   1867   has a disclosed, accepted record AND a canonical ERC-8004 identity
 *          -> Claimless publishes a portable risk summary for it.
 *   77001  has a PENDING incident (not yet accepted) -> correctly priced as
 *          SILENT: pending is not a record. Shown on the dashboard.
 *
 * Run:  cd sdk && npm run seed:demo
 */

import { formatEther, parseAbi, type PublicClient } from "viem";
import {
  CLAIMLESS_TESTNET,
  createRegistryClient,
  kindHash,
  monadTestnet,
  readEnv,
  requireWallet,
} from "../src/index.js";

// Only 10182 carries a disclosed record. 1867 stays clean: it holds a real
// canonical ERC-8004 identity and a Claimless "perfect" portable summary
// (-100 == score 100), which is the honest signal for an agent with no
// disclosed incidents. This keeps the dashboard's RECORD-vs-SILENT contrast.
const RECORD_AGENTS: readonly { id: bigint; severity: number }[] = [{ id: 10182n, severity: 4 }];
const ERC8004_AGENT_ID = 1867n;

const POOL_ABI = parseAbi([
  "function quotePremium(uint256 agentId, uint256 amount, uint256 duration) view returns (uint256 premium, uint256 maxCoverage, bool hadRecord, uint256 riskMultiplier)",
  "function buyCover(uint256 agentId, uint256 amount, uint256 duration) payable returns (uint256 policyId)",
  "function policyCount() view returns (uint256)",
  "function getPolicy(uint256 policyId) view returns ((uint256 id,uint256 agentId,address buyer,uint256 amount,uint256 premium,uint40 startAt,uint40 endAt,bool active))",
]);

const TRIGGER_ABI = parseAbi([
  "function registerTrigger(uint256 policyId, uint256 agentId, uint256 scoreThreshold, uint256 minAcceptedIncidents)",
  "function evaluate(uint256 policyId) returns (bool paid)",
  "function checkCondition(uint256 policyId) view returns (bool met, uint256 score, uint256 accepted)",
  "function triggerCount() view returns (uint256)",
  "function getTrigger(uint256 policyId) view returns ((uint256 policyId,uint256 agentId,uint256 scoreThreshold,uint256 minAcceptedIncidents,bool registered,bool fired))",
]);

const RISK_ABI = parseAbi([
  "function getScore(uint256 agentId) view returns (uint256)",
  "function recompute(uint256 agentId)",
]);

const COVER_AMOUNT = 40_000_000_000_000_000n; // 0.04 MON (normal per-policy cap)
const COVER_DURATION = 30n * 24n * 60n * 60n; // 30 days
const SCORE_THRESHOLD = 90n;

const POOL = CLAIMLESS_TESTNET.coverPool as `0x${string}`;
const TRIGGER = CLAIMLESS_TESTNET.parametricTrigger as `0x${string}`;
const RISK = CLAIMLESS_TESTNET.riskScore as `0x${string}`;

function log(step: string, message: string): void {
  console.log(`[${step}] ${message}`);
}

async function read<const T>(
  client: PublicClient,
  address: `0x${string}`,
  abi: readonly unknown[],
  fn: string,
  args: readonly unknown[] = [],
): Promise<T> {
  return (await client.readContract({
    address,
    abi: abi as never,
    functionName: fn,
    args: args as never,
  })) as T;
}

/**
 * Ensure an agent has exactly one ACCEPTED incident, without waiting out the
 * 3-day challenge window: report -> challenge -> resolve report as standing.
 * Incident ids are GLOBAL, so the target id is read back from the agent's own
 * incident list rather than derived from a per-agent count.
 */
async function ensureRecord(
  registry: ReturnType<typeof createRegistryClient>,
  client: PublicClient,
  agentId: bigint,
  severity: number,
): Promise<{ incidentId: bigint; alreadyAccepted: boolean }> {
  let incidents = await registry.getIncidents(agentId);
  let accepted = incidents.find((i) => i.status === "ACCEPTED");
  if (accepted) {
    log("incident", `agent ${agentId} already has accepted incident ${accepted.id}; skipping`);
    return { incidentId: accepted.id, alreadyAccepted: true };
  }

  let target = incidents[incidents.length - 1];
  if (!target || target.status === "REJECTED") {
    const minStake = await registry.minStake();
    const tx = await registry.reportIncident({
      agentId,
      kind: "SLA_BREACH",
      severity,
      evidenceHash: kindHash(`seed-demo-${agentId}`),
      stakeWei: minStake,
    });
    await client.waitForTransactionReceipt({ hash: tx });
    log("incident", `reported SLA_BREACH severity ${severity} for agent ${agentId} (tx=${tx})`);
    incidents = await registry.getIncidents(agentId);
    target = incidents[incidents.length - 1];
  }
  if (!target) throw new Error(`no incident for agent ${agentId} after reporting`);

  let incident = await registry.getIncident(target.id);
  if (incident.status === "PENDING") {
    const cTx = await registry.challenge(incident.id, incident.stake);
    await client.waitForTransactionReceipt({ hash: cTx });
    incident = await registry.getIncident(incident.id);
  }
  if (incident.status === "CHALLENGED") {
    const rTx = await registry.resolveChallenge(incident.id, true);
    await client.waitForTransactionReceipt({ hash: rTx });
    incident = await registry.getIncident(incident.id);
  }
  if (incident.status !== "ACCEPTED") {
    throw new Error(`expected incident ${incident.id} ACCEPTED, got ${incident.status}`);
  }
  log("challenge", `incident ${incident.id} accepted (agent ${agentId})`);
  return { incidentId: incident.id, alreadyAccepted: false };
}

async function main(): Promise<void> {
  const env = readEnv();
  const { walletClient, account, publicClient } = requireWallet(env);
  const registry = createRegistryClient(env);

  console.log("Claimless — demo state seed (canonical deployment)");
  console.log("=".repeat(64));
  log("wallet", `deployer=${account.address}`);
  log("chain", `IncidentRegistry=${CLAIMLESS_TESTNET.incidentRegistry}`);
  log("chain", `CoverPool=${POOL}`);
  log("chain", `ParametricTrigger=${TRIGGER}`);

  // ── 1. Records (disclosure) ──────────────────────────────────────────────
  console.log("-".repeat(64));
  for (const { id, severity } of RECORD_AGENTS) {
    await ensureRecord(registry, publicClient, id, severity);
  }

  // ── 2. Persist scores so the indexer emits ScoreSnapshots ────────────────
  for (const { id } of RECORD_AGENTS) {
    const tx = await walletClient.writeContract({
      address: RISK,
      abi: RISK_ABI,
      functionName: "recompute",
      args: [id],
      account,
      chain: monadTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    const score = await read<bigint>(publicClient, RISK, RISK_ABI, "getScore", [id]);
    log("score", `agent ${id} score=${score} recompute persisted (tx=${tx})`);
  }

  // ── 3. Buy coverage for the CRE-featured agent (10182) ───────────────────
  const FEATURED = 10182n;
  const policyCount = await read<bigint>(publicClient, POOL, POOL_ABI, "policyCount");
  let policyId: bigint | undefined;
  for (let i = policyCount - 1n; i >= 0n; i--) {
    const p = await read<{ id: bigint; agentId: bigint; active: boolean }>(
      publicClient, POOL, POOL_ABI, "getPolicy", [i],
    );
    if (p.active && p.agentId === FEATURED) {
      policyId = p.id;
      log("cover", `reusing active policy ${policyId} for agent ${FEATURED}`);
      break;
    }
    if (i === 0n) break;
  }
  if (policyId === undefined) {
    const [premium, maxCoverage, hadRecord, mult] = await read<[bigint, bigint, boolean, bigint]>(
      publicClient, POOL, POOL_ABI, "quotePremium", [FEATURED, COVER_AMOUNT, COVER_DURATION],
    );
    log("cover", `quote: premium=${formatEther(premium)} MON cap=${formatEther(maxCoverage)} hadRecord=${hadRecord} mult=${Number(mult) / 10_000}x`);
    if (COVER_AMOUNT > maxCoverage) throw new Error(`cover amount ${COVER_AMOUNT} exceeds cap ${maxCoverage}`);
    const buyTx = await walletClient.writeContract({
      address: POOL,
      abi: POOL_ABI,
      functionName: "buyCover",
      args: [FEATURED, COVER_AMOUNT, COVER_DURATION],
      value: premium,
      account,
      chain: monadTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: buyTx });
    policyId = policyCount;
    log("cover", `bought policy ${policyId} for agent ${FEATURED} (tx=${buyTx})`);
  }

  // ── 4. Register the trigger ──────────────────────────────────────────────
  const trigger = await read<{ registered: boolean; fired: boolean }>(
    publicClient, TRIGGER, TRIGGER_ABI, "getTrigger", [policyId],
  );
  if (!trigger.registered) {
    const regTx = await walletClient.writeContract({
      address: TRIGGER,
      abi: TRIGGER_ABI,
      functionName: "registerTrigger",
      args: [policyId, FEATURED, SCORE_THRESHOLD, 1n],
      account,
      chain: monadTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: regTx });
    log("trigger", `registered policy ${policyId}: score <= ${SCORE_THRESHOLD}, minAccepted 1 (tx=${regTx})`);
  } else {
    log("trigger", `policy ${policyId} already has a trigger (fired=${trigger.fired})`);
  }

  // ── 5. Report the payout condition (do NOT fire: the demo fires it live) ──
  // Leaving the trigger armed is the stronger demo: the presenter calls
  // `evaluate(policyId)` on stage and the payout lands with no claim, no vote
  // and no human decision. `checkCondition` is a pure view, so this step never
  // moves funds.
  const [met, condScore, condAccepted] = await read<[boolean, bigint, bigint]>(
    publicClient, TRIGGER, TRIGGER_ABI, "checkCondition", [policyId],
  );
  const triggerState = await read<{ registered: boolean; fired: boolean }>(
    publicClient, TRIGGER, TRIGGER_ABI, "getTrigger", [policyId],
  );
  log("trigger", `checkCondition: met=${met} score=${condScore} accepted=${condAccepted} fired=${triggerState.fired}`);
  if (triggerState.fired) {
    log("payout", `policy ${policyId} already paid out (history); a fresh policy is armed for the live demo`);
  } else if (met) {
    log("payout", `policy ${policyId} is ARMED and its condition is met. Fire it live with:`);
    log("payout", `  cast send ${TRIGGER} "evaluate(uint256)" ${policyId} --private-key $MONAD_PRIVATE_KEY --rpc-url https://testnet-rpc.monad.xyz`);
  } else {
    log("payout", `policy ${policyId} armed, condition not yet met (no payout)`);
  }

  // ── 6. Publish the ERC-8004 portable risk summary ────────────────────────
  const { publishRiskSummary, getReputation } = await import("../src/erc8004.js");
  const repScore = await read<bigint>(publicClient, RISK, RISK_ABI, "getScore", [ERC8004_AGENT_ID]);
  const existing = await getReputation({ agentId: ERC8004_AGENT_ID, env });
  if (existing.count === 0n) {
    const pubTx = await publishRiskSummary({
      agentId: ERC8004_AGENT_ID,
      score: -repScore,
      decimals: 18,
      tag2: "SLA_BREACH",
      env,
    });
    log("erc8004", `published portable summary -${repScore} for agent ${ERC8004_AGENT_ID} (tx=${pubTx})`);
  } else {
    log("erc8004", `agent ${ERC8004_AGENT_ID} already has ${existing.count} summary(ies), value=${existing.summaryValue}`);
  }

  console.log("=".repeat(64));
  console.log("Demo state restored on the canonical deployment.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
