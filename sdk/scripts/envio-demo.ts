/**
 * Envio indexer demo.
 *
 * Queries the local Envio/Hasura indexer for real indexed Claimless data:
 * the endpoint in use, the Agent list, incidents for agent 10182, and the
 * score history for agent 10182.
 *
 * Run: pnpm envio:demo   (indexer must be running — see indexer/docker-compose.yaml)
 */

import { createEnvioClient, INDEXER_CHAIN_ID } from "../src/envio.js";
import { readEnv } from "../src/env.js";
import type { IndexedAgent, IndexedIncident, IndexedScoreSnapshot } from "../src/types.js";

/** ERC-8004 agent id exercised by the demos (the seeded test agent). */
const DEMO_AGENT_ID = "10182";

function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function unixToLocal(iso: string): string {
  const ms = Number(iso) * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : `invalid(${iso})`;
}

function printAgent(agent: IndexedAgent): void {
  console.log(
    `    id=${agent.id} score=${agent.currentScore} ` +
      `incidents=${agent.incidentCount} accepted=${agent.acceptedCount} ` +
      `rejected=${agent.rejectedCount} pending=${agent.pendingCount} ` +
      `severitySum=${agent.severitySum} avgSeverity=${agent.avgSeverity}`,
  );
  console.log(
    `    firstSeen=${unixToLocal(agent.firstSeenAt)} lastActive=${unixToLocal(agent.lastActiveAt)}`,
  );
}

function printIncident(incident: IndexedIncident): void {
  console.log(
    `    id=${incident.id} status=${incident.status} severity=${incident.severity} ` +
      `reporter=${shortHash(incident.reporter)} stake=${incident.stake}`,
  );
  console.log(
    `    kind=${shortHash(incident.kind)} reportedAt=${unixToLocal(incident.reportedAt)} ` +
      `deadline=${unixToLocal(incident.challengeDeadline)} ` +
      `finalizedAt=${incident.finalizedAt ? unixToLocal(incident.finalizedAt) : "null"}`,
  );
  console.log(`    tx=${shortHash(incident.txHash)} block=${incident.blockNumber}`);
}

function printScore(snapshot: IndexedScoreSnapshot): void {
  console.log(
    `    id=${snapshot.id} ${snapshot.oldScore} -> ${snapshot.newScore} ` +
      `at=${unixToLocal(snapshot.timestamp)} block=${snapshot.blockNumber}`,
  );
}

function printHint(): void {
  console.log("\n  The Envio indexer is not reachable.");
  console.log("  Start it from the repo root:");
  console.log("    docker compose -f indexer/docker-compose.yaml up -d");
  console.log("  Then wait a few seconds for Hasura to accept queries and re-run:");
  console.log("    pnpm envio:demo");
  console.log(
    "  (Override the endpoint with CLAIMLESS_GRAPHQL_URL / HASURA_GRAPHQL_ADMIN_SECRET.)",
  );
}

async function main(): Promise<void> {
  const env = readEnv();
  const client = createEnvioClient(env);

  console.log("Claimless — Envio indexer (Hasura GraphQL) demo");
  console.log(`  endpoint:     ${client.graphqlUrl}`);
  console.log(`  chain id:     ${INDEXER_CHAIN_ID} (Monad testnet)`);
  console.log(`  secret sent:  ${env.hasuraSecret ? "(set)" : "(missing)"}`);

  console.log("\n── Agent list ──────────────────────────────");
  const agents = await client.getAgents({ limit: 10 });
  if (agents.length === 0) {
    console.log("  (no agents indexed yet)");
  }
  for (const agent of agents) {
    printAgent(agent);
  }

  console.log(`\n── Incidents for agent ${DEMO_AGENT_ID} ────────────────`);
  const incidents = await client.getIncidents(DEMO_AGENT_ID, { limit: 10 });
  if (incidents.length === 0) {
    console.log("  (no incidents for this agent)");
  }
  for (const incident of incidents) {
    printIncident(incident);
  }

  console.log(`\n── Score history for agent ${DEMO_AGENT_ID} ─────────────`);
  const scores = await client.getScoreHistory(DEMO_AGENT_ID, { limit: 10 });
  if (scores.length === 0) {
    console.log("  (no score snapshots for this agent)");
  }
  for (const snapshot of scores) {
    printScore(snapshot);
  }

  console.log(`\n── Full summary for agent ${DEMO_AGENT_ID} (single query) ──`);
  const summary = await client.getAgentSummary(DEMO_AGENT_ID);
  if (!summary.agent) {
    console.log("  (agent not found)");
  } else {
    printAgent(summary.agent);
    console.log(`  incidents: ${summary.incidents.length}`);
    console.log(`  recentScores: ${summary.recentScores.length}`);
    if (summary.recentScores.length > 0) {
      console.log(`  latest score: ${summary.recentScores[0].newScore}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err: unknown) => {
  console.error("\n✗ envio:demo failed");
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  printHint();
  process.exitCode = 1;
});