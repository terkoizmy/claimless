/**
 * Read-only demo of the on-chain IncidentRegistry.
 *
 * Run with: `pnpm registry:demo` (from sdk/)
 * Requires NO environment variables: defaults point at the deployed
 * IncidentRegistry on Monad testnet via the public RPC. No signer needed.
 */

import { formatEther, formatUnits } from "viem";
import {
  CHALLENGE_WINDOW,
  INCIDENT_REGISTRY_ADDRESS,
  createRegistryClient,
  getAcceptedCount,
  getAcceptedSeveritySum,
  getIncidentCount,
  getIncidents,
  minStake,
  totalIncidents,
  type OnChainIncident,
} from "../src/registry.js";

/** agentId used by the demo; matches the test agent id used across the repo. */
const DEMO_AGENT_ID = 10182n;

function fmtIncident(inc: OnChainIncident, index: number): string {
  const lines = [
    `  [${index}] incident ${inc.id} on agent ${inc.agentId}`,
    `      status:      ${inc.status}`,
    `      severity:    ${inc.severity}/5`,
    `      kind:        ${inc.kind}`,
    `      evidence:    ${inc.evidenceHash}`,
    `      reporter:    ${inc.reporter}`,
    `      stake:       ${formatEther(inc.stake)} MON (${inc.stake} wei)`,
  ];
  if (inc.challenger !== "0x0000000000000000000000000000000000000000") {
    lines.push(
      `      challenger:  ${inc.challenger}`,
      `      challenge:   ${formatEther(inc.challengeStake)} MON (${inc.challengeStake} wei)`,
    );
  } else {
    lines.push(`      challenger:  none`);
  }
  lines.push(
    `      reportedAt:  ${new Date(inc.reportedAt * 1000).toISOString()} (ts ${inc.reportedAt})`,
    `      deadline:    ${new Date(inc.challengeDeadline * 1000).toISOString()} (ts ${inc.challengeDeadline})`,
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const registry = createRegistryClient();
  const address = INCIDENT_REGISTRY_ADDRESS;

  console.log("════════════════════════════════════════════════════════════");
  console.log(" Claimless — on-chain IncidentRegistry (read-only demo)");
  console.log(` registry: ${address}`);
  console.log(" network:  Monad testnet (10143)");
  console.log("════════════════════════════════════════════════════════════");

  const [total, stakeWei, windowSec] = await Promise.all([
    totalIncidents(),
    minStake(),
    CHALLENGE_WINDOW(),
  ]);

  console.log(`\n totalIncidents():          ${total}`);
  console.log(
    ` minStake():                ${formatEther(stakeWei)} MON (${stakeWei} wei)`,
  );
  console.log(
    ` CHALLENGE_WINDOW():        ${windowSec} s (${formatUnits(windowSec, 0)} sec; ` +
      `${(Number(windowSec) / 86400).toFixed(2)} days)`,
  );

  const [count, accepted, severitySum, incidents] = await Promise.all([
    getIncidentCount(DEMO_AGENT_ID),
    getAcceptedCount(DEMO_AGENT_ID),
    getAcceptedSeveritySum(DEMO_AGENT_ID),
    getIncidents(DEMO_AGENT_ID),
  ]);

  console.log(`\n agent ${DEMO_AGENT_ID}:`);
  console.log(`   getIncidentCount():        ${count}`);
  console.log(`   getAcceptedCount():        ${accepted}`);
  console.log(`   getAcceptedSeveritySum():  ${severitySum}`);

  console.log(`\n getIncidents(${DEMO_AGENT_ID}): ${incidents.length} incident(s)`);
  if (incidents.length === 0) {
    console.log("   (none reported on chain for this agent)");
  } else {
    console.log(incidents.map(fmtIncident).join("\n"));
  }

  console.log("\n done (read-only; no signer used, no transaction sent)");
}

main().catch((err) => {
  console.error("registry-demo failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});