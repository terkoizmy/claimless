/**
 * ERC-8004 adapter demo — read-only, no env vars needed.
 *
 * Run: pnpm erc8004:demo
 *
 * For agents 1867 and 10182 on Monad testnet, prints:
 *   - identity from the canonical IdentityRegistry (owner, agent wallet, URI)
 *   - reputation summary via the canonical ReputationRegistry.getSummary
 *     (clients = our adapter, tag1 = "claimless:incident")
 *   - the same read through our deployed AgentIdentity adapter's getAgentRisk
 *   - a human-openable explorer link
 *
 * Agent ids that do not exist degrade gracefully: the revert is caught and
 * "not registered" is printed instead of crashing.
 */

import agentIdentityAbi from "../src/abis/AgentIdentity.json" with { type: "json" };
import {
  AGENT_IDENTITY_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
  explorerUrl,
  formatReputation,
  getAgentIdentity,
  getReputation,
} from "../src/erc8004.js";
import { getPublicClient } from "../src/chain.js";
import { readEnv } from "../src/env.js";
import type { AgentReputation } from "../src/types.js";

const AGENT_IDS = [1867n, 10182n] as const;

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // The canonical registry reverts ERC721NonexistentToken for unknown ids.
  if (/ERC721NonexistentToken|nonexistent token/i.test(message)) return "not registered";
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

function printSummary(label: string, rep: AgentReputation): void {
  console.log(`  ${label}: count=${rep.count} summaryValue=${rep.summaryValue} decimals=${rep.summaryValueDecimals}`);
  console.log(`  ${" ".repeat(label.length)}  formatted = ${formatReputation(rep)}`);
}

/** Read the same Claimless summary through our adapter's getAgentRisk view. */
async function readAdapterRisk(agentId: bigint): Promise<AgentReputation> {
  const client = getPublicClient(readEnv());
  const raw = (await client.readContract({
    address: AGENT_IDENTITY_ADDRESS,
    abi: agentIdentityAbi,
    functionName: "getAgentRisk",
    args: [agentId],
  })) as unknown as [bigint, bigint, number];
  const [count, summaryValue, summaryValueDecimals] = raw;
  return { agentId, count, summaryValue, summaryValueDecimals };
}

async function inspectAgent(agentId: bigint): Promise<void> {
  console.log(`\nAgent ${agentId}`);
  console.log("-".repeat(64));

  // Identity (owner, wallet, uri). Reverts if the token id does not exist.
  let identity;
  try {
    identity = await getAgentIdentity(agentId);
  } catch (err) {
    console.log(`  identity   : ${describe(err)}`);
    console.log(`  reputation : skipped (no such agent)`);
    console.log(`  explorer   : ${explorerUrl(agentId)}`);
    return;
  }
  console.log(`  identity`);
  console.log(`    owner       = ${identity.owner}`);
  console.log(`    agentWallet = ${identity.agentWallet}`);
  console.log(`    tokenURI    = ${identity.tokenURI === "" ? "(empty)" : identity.tokenURI}`);

  // Reputation, canonical path (clients = our adapter, tag1 = claimless:incident).
  try {
    const rep = await getReputation({ agentId });
    printSummary("reputation (canonical registry)", rep);
  } catch (err) {
    console.log(`  reputation (canonical registry) : ${describe(err)}`);
  }

  // Reputation, adapter path (same clients/tags via getAgentRisk view).
  try {
    const adapterRep = await readAdapterRisk(agentId);
    printSummary("reputation (our adapter)        ", adapterRep);
  } catch (err) {
    console.log(`  reputation (our adapter)        : ${describe(err)}`);
  }

  console.log(`  explorer   : ${explorerUrl(agentId)}`);
}

async function main(): Promise<void> {
  console.log("Claimless ERC-8004 adapter demo — Monad testnet (read-only)");
  console.log(`IdentityRegistry    : ${IDENTITY_REGISTRY_ADDRESS}`);
  console.log(`AgentIdentity (ours): ${AGENT_IDENTITY_ADDRESS}`);
  console.log("=".repeat(64));

  for (const agentId of AGENT_IDS) {
    await inspectAgent(agentId);
  }

  console.log("\nOK: ERC-8004 demo complete.");
}

main().catch((err) => {
  console.error(`erc8004-demo failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});