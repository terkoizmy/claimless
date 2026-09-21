/**
 * Client-path verification without a browser: executes the exact same modules
 * the React pages run (lib/chain.ts + lib/abi.ts + lib/deployments.ts) through
 * the SDK's tsx loader, and prints every value the pages will render.
 *
 * Run from web/:  npx tsx scripts/verify-reads.mts
 * Read-only. Uses viem against the public Monad testnet RPC.
 */

import { getPublicClient } from "../lib/chain.js";
import {
  coverPoolAbi,
  erc8004IdentityAbi,
  incidentRegistryAbi,
  parametricTriggerAbi,
  riskScoreAbi,
} from "../lib/abi.js";
import {
  ADDRESSES,
  KNOWN_AGENT_IDS,
  QUOTE_AMOUNT,
  QUOTE_DURATION_SECONDS,
} from "../lib/deployments.js";
import { formatEther } from "../lib/format.js";

const client = getPublicClient();

const STATUS_NAMES = ["PENDING", "ACCEPTED", "REJECTED", "CHALLENGED"] as const;

async function read<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const v = await fn();
  console.log(`  read ${label} -> ok`);
  return v;
}

async function main() {
  console.log("=== verify-reads: same modules the dashboard pages use ===");
  console.log(`chain=${(await client.getChainId())} rpc=${"https://testnet-rpc.monad.xyz"}`);

  for (const agentId of KNOWN_AGENT_IDS) {
    const [score, acceptedCount, severitySum] = (await read(`getScoreBundle(${agentId})`, () =>
      client.readContract({
        address: ADDRESSES.riskScore,
        abi: riskScoreAbi,
        functionName: "getScoreBundle",
        args: [agentId],
      }),
    )) as unknown as [bigint, bigint, bigint];

    const incidentCount = (await read(`getIncidentCount(${agentId})`, () =>
      client.readContract({
        address: ADDRESSES.incidentRegistry,
        abi: incidentRegistryAbi,
        functionName: "getIncidentCount",
        args: [agentId],
      }),
    )) as unknown as bigint;

    const [premium, maxCoverage, hadRecord, riskMultiplier] = (await read(
      `quotePremium(${agentId}, 1e18, 30d)`,
      () =>
        client.readContract({
          address: ADDRESSES.coverPool,
          abi: coverPoolAbi,
          functionName: "quotePremium",
          args: [agentId, QUOTE_AMOUNT, QUOTE_DURATION_SECONDS],
        }),
    )) as unknown as [bigint, bigint, boolean, bigint];

    console.log(
      `agent ${agentId}: score=${score} accepted=${acceptedCount} sevSum=${severitySum} ` +
        `incidents=${incidentCount} RECORD=${hadRecord} ` +
        `premium=${formatEther(premium)} maxCoverage=${formatEther(maxCoverage)} mult=${Number(riskMultiplier) / 10_000}x`,
    );
  }

  const [totalCapital, lockedCapital, capacity, policyCount, premiumsCollected] =
    (await read("pool state", async () =>
      Promise.all([
        client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "totalCapital" }),
        client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "lockedCapital" }),
        client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "getCapacity" }),
        client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "policyCount" }),
        client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "premiumsCollected" }),
      ]),
    )) as unknown as [bigint, bigint, bigint, bigint, bigint];

  console.log(
    `CoverPool: totalCapital=${formatEther(totalCapital)} capacity=${formatEther(capacity)} locked=${formatEther(lockedCapital)} policies=${policyCount} premiums=${formatEther(premiumsCollected)}`,
  );

  const [forwarder, triggerCount] = (await read("trigger state", async () =>
    Promise.all([
      client.readContract({ address: ADDRESSES.parametricTrigger, abi: parametricTriggerAbi, functionName: "forwarder" }),
      client.readContract({ address: ADDRESSES.parametricTrigger, abi: parametricTriggerAbi, functionName: "triggerCount" }),
    ]),
  )) as unknown as [string, bigint];

  console.log(`ParametricTrigger: forwarder=${forwarder} triggerCount=${triggerCount}`);

  for (const agentId of KNOWN_AGENT_IDS) {
    try {
      const owner = (await read(`erc8004 ownerOf(${agentId})`, () =>
        client.readContract({
          address: ADDRESSES.erc8004Identity,
          abi: erc8004IdentityAbi,
          functionName: "ownerOf",
          args: [agentId],
        }),
      )) as unknown as string;
      console.log(`ERC-8004 ownerOf(${agentId}) = ${owner}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ERC721NonexistentToken|nonexistent/i.test(msg)) {
        console.log(`ERC-8004 ownerOf(${agentId}) = not registered (ERC721NonexistentToken)`);
      } else {
        throw err;
      }
    }
  }

  const inc = (await read("getIncident(0)", () =>
    client.readContract({
      address: ADDRESSES.incidentRegistry,
      abi: incidentRegistryAbi,
      functionName: "getIncident",
      args: [0n],
    }),
  )) as unknown as [
    bigint,
    bigint,
    string,
    number,
    string,
    string,
    bigint,
    bigint,
    bigint,
    string,
    bigint,
    number,
  ];
  const [id, incAgentId, kind, severity, evidenceHash, reporter, stake, , , , , status] = inc;
  console.log(
    `incident #${id}: agentId=${incAgentId} kind=${kind} severity=${severity} ` +
      `status=${STATUS_NAMES[status]} reporter=${reporter} stake=${formatEther(stake)} MON ` +
      `evidence=${evidenceHash}`,
  );

  console.log("=== verify-reads OK: all dashboard reads executed against chain 10143 ===");
}

main().catch((err) => {
  console.error(`verify-reads FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});