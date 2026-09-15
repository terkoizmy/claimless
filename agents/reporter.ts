/**
 * Claimless autonomous incident reporter.
 *
 * This is the "an agent reports an incident with no human interaction" demo from
 * the Claimless scenario. It:
 *   1. resolves a signer (Privy agent wallet when configured, local key as fallback)
 *   2. verifies it can actually reach Monad testnet and that the registry exists
 *   3. reports an incident with a staked bond and a hashed evidence commitment
 *   4. reads the incident back from the contract and prints the explorer link
 *
 * Run it from the sdk directory:
 *
 *   cd sdk
 *   set MONAD_PRIVATE_KEY=0x...      (or configure PRIVY_APP_ID / PRIVY_APP_SECRET)
 *   pnpm report                      (defaults: agent 10182, SLA_BREACH, severity 4)
 *
 * Environment overrides:
 *   AGENT_ID       ERC-8004 agent id to report against (default 10182)
 *   INCIDENT_KIND  one of INCIDENT_KINDS (default SLA_BREACH)
 *   SEVERITY       1..5 (default 4)
 *   STAKE_MON      stake in MON (default: the contract's minStake)
 *   DRY_RUN        "1" to validate and print the plan without sending a transaction
 *
 * Wallet separation: Mera is for humans (needs user presence), Privy for agents
 * (headless). See docs/WALLET_DECISION.md.
 */

import {
  CLAIMLESS_TESTNET,
  INCIDENT_KINDS,
  createRegistryClient,
  assertChainId,
  assertHasCode,
  describeSignerAvailability,
  evidenceHash,
  formatEther,
  kindHash,
  parseEther,
  readEnv,
  resolveSigner,
  type IncidentKind,
} from "../sdk/src/index.js";

const EXPLORER = "https://testnet.monadvision.com";

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function log(step: string, message: string): void {
  console.log(`[${step}] ${message}`);
}

async function main(): Promise<void> {
  const env = readEnv();

  console.log("Claimless autonomous agent — incident reporter");
  console.log("=".repeat(64));

  // ── 1. Signer ─────────────────────────────────────────────────────────────
  const availability = describeSignerAvailability(env);
  log("signer", `availability: ${availability.kind} (${availability.reason})`);
  if (availability.kind === "privy") {
    log("signer", "using a Privy agent wallet (keys in a TEE, ephemeral signing)");
  } else if (availability.kind === "local") {
    log("signer", "using the LOCAL key fallback — set Privy credentials for the production path");
  }

  const signer = await resolveSigner(env);
  const address = await signer.address();
  log("signer", `kind=${signer.kind} address=${address}`);

  // ── 2. Reachability guards ────────────────────────────────────────────────
  const client = createRegistryClient(env);
  await assertChainId(client.publicClient);
  log("chain", `connected to chain ${await client.publicClient.getChainId()} (Monad testnet)`);

  await assertHasCode(client.publicClient, CLAIMLESS_TESTNET.incidentRegistry, "IncidentRegistry");
  log("chain", `IncidentRegistry present at ${CLAIMLESS_TESTNET.incidentRegistry}`);

  const minStake = await client.minStake();
  const window = await client.CHALLENGE_WINDOW();
  log("chain", `minStake=${formatEther(minStake)} MON, CHALLENGE_WINDOW=${Number(window) / 86400} days`);

  // ── 3. Build the report ───────────────────────────────────────────────────
  const agentId = BigInt(envOr("AGENT_ID", "10182"));
  const kindName = envOr("INCIDENT_KIND", "SLA_BREACH");
  const severity = Number(envOr("SEVERITY", "4"));
  const stakeMon = process.env.STAKE_MON;
  const stakeWei = stakeMon ? parseEther(stakeMon) : minStake;

  if (!INCIDENT_KINDS.includes(kindName as IncidentKind)) {
    throw new Error(`INCIDENT_KIND must be one of: ${INCIDENT_KINDS.join(", ")}`);
  }
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
    throw new Error(`SEVERITY must be an integer 1..5, got ${severity}`);
  }

  // The payload stays off-chain; only this commitment goes on chain.
  const observed = {
    agentId: agentId.toString(),
    kind: kindName,
    severity,
    detectedAt: new Date().toISOString(),
    detail: "Agent missed its SLA window on the demo workload.",
  };
  const commitment = evidenceHash(observed);

  const beforeCount = await client.getIncidentCount(agentId);

  console.log("-".repeat(64));
  log("report", `agentId=${agentId} kind=${kindName} (${kindHash(kindName)})`);
  log("report", `severity=${severity}/5  stake=${formatEther(stakeWei)} MON`);
  log("report", `evidenceHash=${commitment}`);
  log("report", `existing incidents for this agent: ${beforeCount}`);

  if (envOr("DRY_RUN", "0") === "1") {
    log("report", "DRY_RUN=1 — validating only, not sending the transaction");
    console.log("\nPlan validated. Re-run without DRY_RUN to submit.");
    return;
  }

  // ── 4. Send it ────────────────────────────────────────────────────────────
  log("tx", "submitting reportIncident...");
  const txHash = await client.reportIncident({
    agentId,
    kind: kindName,
    severity,
    evidenceHash: commitment,
    stakeWei,
  });
  log("tx", `submitted: ${txHash}`);

  const receipt = await client.publicClient.waitForTransactionReceipt({ hash: txHash });
  log("tx", `mined in block ${receipt.blockNumber} (status ${receipt.status})`);

  // ── 5. Read it back (never assume the id) ─────────────────────────────────
  const afterCount = await client.getIncidentCount(agentId);
  const incidents = await client.getIncidents(agentId);
  const created = incidents[incidents.length - 1];

  console.log("-".repeat(64));
  log("result", `incidents before=${beforeCount} after=${afterCount}`);
  if (created) {
    log("result", `incident id=${created.id} status=${created.status} severity=${created.severity}`);
    log("result", `reporter=${created.reporter}`);
    log("result", `challenge deadline=${new Date(created.challengeDeadline * 1000).toISOString()}`);
  }
  log("result", `explorer: ${EXPLORER}/tx/${txHash}`);

  console.log("\nDone. The agent reported an incident with no human interaction.");
  if (signer.kind === "local") {
    console.log("NOTE: this run used the local key fallback. Configure Privy for the agent-wallet path.");
  }
}

main().catch((err) => {
  console.error("\nReporter failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
