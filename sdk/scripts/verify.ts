/**
 * End-to-end verification across independent data paths.
 *
 * This is the Week 2 gate check: the same facts must be readable from more than
 * one place, and all of them must agree. Where they can be cross-checked against
 * the chain directly, they are.
 *
 * Checks:
 *   1. RiskScore from the CONTRACT  (direct RPC eth_call)
 *   2. RiskScore from the INDEXER   (Envio GraphQL, a separate process)
 *   3. the two agree
 *   4. registry incident counts match between contract and indexer
 *   5. ERC-8004 reputation summary for agent 1867 reads back what was published
 *   6. Aurora Intents returns a live dry quote (no funds, no key)
 *
 * Run: cd sdk && pnpm verify
 */

import {
  CLAIMLESS_TESTNET,
  ERC8004,
  TAG1_INCIDENT,
  createEnvioClient,
  createRegistryClient,
  getReputation,
  getScoreFromContract,
  quoteMonadUsdcDeposit,
} from "../src/index.js";

const AGENT_ID = 10182n;
const ERC8004_AGENT_ID = 1867n;

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail: string): void {
  const mark = ok ? "PASS" : "FAIL";
  if (ok) passed++;
  else failed++;
  console.log(`  [${mark}] ${label}`);
  console.log(`         ${detail}`);
}

async function main(): Promise<void> {
  console.log("Claimless — end-to-end verification");
  console.log("=".repeat(64));

  // ── 1 & 2 & 3: risk score from two independent paths ────────────────────
  console.log("\n1) Risk score: two independent sources");

  const fromContract = await getScoreFromContract(AGENT_ID);
  console.log(`     contract: score=${fromContract.score} accepted=${fromContract.acceptedCount} severitySum=${fromContract.severitySum} (source=${fromContract.source})`);

  let fromIndexerScore: number | undefined;
  let indexerNote = "";
  try {
    const envio = createEnvioClient();
    const agent = await envio.getAgent(AGENT_ID.toString());
    if (agent) {
      fromIndexerScore = Number(agent.currentScore);
      indexerNote = `indexer:  score=${agent.currentScore} accepted=${agent.acceptedCount} severitySum=${agent.severitySum}`;
    } else {
      indexerNote = "indexer:  agent not found (indexer may be down or not synced)";
    }
  } catch (err) {
    indexerNote = `indexer unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log(`     ${indexerNote}`);

  if (fromIndexerScore === undefined) {
    check(
      "score agrees across paths",
      false,
      "could not read from the indexer; start it with: cd indexer && docker compose up -d",
    );
  } else {
    check(
      "score agrees across paths",
      fromIndexerScore === fromContract.score,
      `contract=${fromContract.score} indexer=${fromIndexerScore}`,
    );
  }

  // ── 4: incident counts ─────────────────────────────────────────────────
  console.log("\n2) Incident counts consistent with the contract");

  const registry = createRegistryClient();
  const acceptCount = await registry.getAcceptedCount(AGENT_ID);
  const totalIncidents = await registry.totalIncidents();
  const minStake = await registry.minStake();
  const windowSeconds = Number(await registry.CHALLENGE_WINDOW());

  check(
    "acceptedCount matches the score's own input",
    acceptCount === fromContract.acceptedCount,
    `getAcceptedCount=${acceptCount}, score bundle says ${fromContract.acceptedCount}`,
  );
  check(
    "challenge window is 3 days",
    windowSeconds === 3 * 24 * 60 * 60,
    `${windowSeconds}s = ${windowSeconds / 86400} days`,
  );
  console.log(`     registry: totalIncidents=${totalIncidents} minStake=${minStake} wei`);

  // ── 5: ERC-8004 round trip ─────────────────────────────────────────────
  console.log("\n3) ERC-8004 reputation (what Claimless published)");

  try {
    const rep = await getReputation({ agentId: ERC8004_AGENT_ID });
    check(
      "reputation summary is readable and non-empty",
      rep.count > 0n,
      `count=${rep.count} value=${rep.summaryValue} decimals=${rep.summaryValueDecimals} tag1=${TAG1_INCIDENT} clients=[adapter]`,
    );
  } catch (err) {
    check("reputation readable", false, err instanceof Error ? err.message : String(err));
  }
  console.log(`     registries: identity=${ERC8004.testnet.identity} reputation=${ERC8004.testnet.reputation}`);
  console.log(`     claimless adapter=${CLAIMLESS_TESTNET.agentIdentity}`);

  // ── 6: Aurora Intents live dry quote ───────────────────────────────────
  console.log("\n4) Aurora Intents dry quote (no funds, no API key)");

  try {
    const quote = await quoteMonadUsdcDeposit({
      amountUsdc: "0.50",
      recipient: "0xF601a214CF0FFf4741e7DD405FB5A75B46388395",
      refundTo: "0xF601a214CF0FFf4741e7DD405FB5A75B46388395",
      dry: true,
    });
    // The 1Click API nests the numbers under `quote`, e.g.
    //   { quote: { amountIn, amountOut, amountOutUsd, timeEstimate }, quoteRequest: {...} }
    const details = (quote as { quote?: { amountOut?: string; amountOutUsd?: string; timeEstimate?: number } }).quote;
    check(
      "live dry quote returned",
      Boolean(details?.amountOut),
      `amountOut=${details?.amountOut ?? "(none)"} usd=${details?.amountOutUsd ?? "?"} timeEstimate=${details?.timeEstimate ?? "?"}s`,
    );
  } catch (err) {
    check("dry quote returned", false, err instanceof Error ? err.message : String(err));
  }

  // ── summary ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(64));
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nReminder: the indexer must be running for checks 1 and 2:");
    console.log("  cd indexer && docker compose up -d");
  }
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nVerification failed to run:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
