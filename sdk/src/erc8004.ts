/**
 * ERC-8004 adapter for the Claimless SDK.
 *
 * We WRITE INTO the canonical ERC-8004 registries; we never fork them.
 * Reads go straight to the canonical registries; writes go through our
 * deployed `AgentIdentity` adapter contract (contracts/src/AgentIdentity.sol),
 * which is the owner in the canonical ReputationRegistry and is the recorded
 * client (feedback reporter) for `getSummary` aggregations.
 *
 * Monad testnet addresses (deterministic ERC-8004 deployments):
 *   IdentityRegistry   0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713
 *
 * Canonical agent ids start at 0. Self-feedback is blocked on-chain, and the
 * adapter additionally refuses to publish a summary for an agent it owns.
 *
 * Signed fixed-point: `getSummary` returns `(count, summaryValue,
 * summaryValueDecimals)` where `summaryValue` is int128 scaled by
 * `summaryValueDecimals` (e.g. -87e18 with decimals 18). Use
 * `formatReputation` for a human-readable rendering.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
} from "viem";
import identityRegistryAbi from "./abis/Erc8004IdentityRegistry.json" with { type: "json" };
import reputationRegistryAbi from "./abis/Erc8004ReputationRegistry.json" with { type: "json" };
import agentIdentityAbi from "./abis/AgentIdentity.json" with { type: "json" };
import { ERC8004, CLAIMLESS_TESTNET, TAG1_INCIDENT } from "./config.js";
import { getPublicClient, monadTestnet, requireWallet } from "./chain.js";
import type { ClaimlessEnv } from "./env.js";
import type { AgentIdentityInfo, AgentReputation } from "./types.js";

/** Canonical ERC-8004 IdentityRegistry on Monad testnet. */
export const IDENTITY_REGISTRY_ADDRESS = ERC8004.testnet.identity as `0x${string}`;

/** Canonical ERC-8004 ReputationRegistry on Monad testnet. */
export const REPUTATION_REGISTRY_ADDRESS = ERC8004.testnet.reputation as `0x${string}`;

/** Our deployed AgentIdentity adapter (the write path into the registries). */
export const AGENT_IDENTITY_ADDRESS = CLAIMLESS_TESTNET.agentIdentity as `0x${string}`;

/** Default feedback client for adapter-path summaries: the adapter itself. */
const DEFAULT_CLIENTS: readonly `0x${string}`[] = [AGENT_IDENTITY_ADDRESS];

/** Options threading an explicit env through the read/write helpers. */
export interface Erc8004EnvOptions {
  env?: ClaimlessEnv;
}

export interface GetReputationOptions extends Erc8004EnvOptions {
  agentId: bigint;
  /** Feedback clients to filter on. Default: our adapter. Must be non-empty. */
  clients?: readonly `0x${string}`[];
  /** Primary taxonomy tag. Default: "claimless:incident". */
  tag1?: string;
  /** Free-form secondary tag. Default: "". */
  tag2?: string;
}

export interface PublishRiskSummaryOptions extends Erc8004EnvOptions {
  agentId: bigint;
  /** Signed fixed-point risk value, scale given by `decimals`. */
  score: bigint;
  /** Decimals of `score` (0-18). Default: 18. */
  decimals?: number;
  /** Primary taxonomy tag. Default: "claimless:incident". */
  tag1?: string;
  /** Free-form secondary tag. Default: "". */
  tag2?: string;
}

export interface RegisterAgentOptions extends Erc8004EnvOptions {
  /** ERC-8004 agent registration file URI. */
  agentURI: string;
}

/** Build a fresh read client for the given env (per-call envs must fail for real). */
function clientFor(env?: ClaimlessEnv): PublicClient {
  if (!env) return getPublicClient();
  return createPublicClient({
    chain: monadTestnet,
    transport: http(env.rpcUrl, { retryCount: 0, timeout: 20_000 }),
  });
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Identity reads (canonical registry, read-only)
// ---------------------------------------------------------------------------

/** Full identity record for an agent from the canonical IdentityRegistry. */
export async function getAgentIdentity(
  agentId: bigint,
  env?: ClaimlessEnv,
): Promise<AgentIdentityInfo> {
  const [owner, agentWallet, tokenURI] = await Promise.all([
    getAgentOwner(agentId, env),
    getAgentWallet(agentId, env),
    getAgentURI(agentId, env),
  ]);
  return { agentId, owner, agentWallet, tokenURI };
}

/** Canonical ERC-721 owner of an agent id (reverts if the id does not exist). */
export async function getAgentOwner(
  agentId: bigint,
  env?: ClaimlessEnv,
): Promise<`0x${string}`> {
  const client = clientFor(env);
  return (await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [agentId],
  })) as `0x${string}`;
}

/** Agent wallet recorded in the canonical IdentityRegistry. */
export async function getAgentWallet(
  agentId: bigint,
  env?: ClaimlessEnv,
): Promise<`0x${string}`> {
  const client = clientFor(env);
  return (await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "getAgentWallet",
    args: [agentId],
  })) as `0x${string}`;
}

/** tokenURI registered for an agent id. */
export async function getAgentURI(
  agentId: bigint,
  env?: ClaimlessEnv,
): Promise<string> {
  const client = clientFor(env);
  return (await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "tokenURI",
    args: [agentId],
  })) as string;
}

// ---------------------------------------------------------------------------
// Reputation reads
// ---------------------------------------------------------------------------

/**
 * Aggregate reputation summary for an agent.
 *
 * Reads the canonical ReputationRegistry's `getSummary(agentId, clients[],
 * tag1, tag2)`, which REQUIRES a non-empty `clients` array. Defaults:
 * `clients = [our adapter]`, `tag1 = "claimless:incident"`, `tag2 = ""`.
 */
export async function getReputation(options: GetReputationOptions): Promise<AgentReputation> {
  const { agentId, env } = options;
  const clients = options.clients ?? DEFAULT_CLIENTS;
  const tag1 = options.tag1 ?? TAG1_INCIDENT;
  const tag2 = options.tag2 ?? "";

  if (clients.length === 0) {
    throw new Error(
      "getReputation requires a non-empty `clients` array: the canonical " +
        "ERC-8004 ReputationRegistry.getSummary reverts on empty client lists. " +
        "Pass at least one client address (default: the Claimless adapter).",
    );
  }

  const client = clientFor(env);
  const raw = (await client.readContract({
    address: REPUTATION_REGISTRY_ADDRESS,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [...clients], tag1, tag2],
  })) as unknown as [bigint, bigint, number];
  const [count, summaryValue, summaryValueDecimals] = raw;
  return { agentId, count, summaryValue, summaryValueDecimals };
}

// ---------------------------------------------------------------------------
// Writes (through our adapter contract; signer required)
// ---------------------------------------------------------------------------

/**
 * Publish a Claimless risk summary into the canonical ReputationRegistry via
 * the deployed AgentIdentity adapter (`publishRiskSummary`, owner-only; it
 * calls `giveFeedback` internally). Returns the transaction hash.
 */
export async function publishRiskSummary(
  options: PublishRiskSummaryOptions,
): Promise<`0x${string}`> {
  const { agentId, score, env } = options;
  const decimals = options.decimals ?? 18;
  const tag1 = options.tag1 ?? TAG1_INCIDENT;
  const tag2 = options.tag2 ?? "";

  const { walletClient, account, publicClient } = requireWallet(env);
  const hash = await walletClient.writeContract({
    address: AGENT_IDENTITY_ADDRESS,
    abi: agentIdentityAbi,
    functionName: "publishRiskSummary",
    args: [agentId, score, decimals, tag1, tag2],
    account,
    chain: monadTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Register a new agent in the canonical IdentityRegistry through our adapter
 * (`registerAgent(agentURI)`); the adapter mints via the canonical registry
 * and immediately hands the identity NFT to the calling operator. Returns the
 * minted canonical agent id and the transaction hash.
 */
export async function registerAgent(
  options: RegisterAgentOptions,
): Promise<{ agentId: bigint; txHash: `0x${string}` }> {
  const { agentURI, env } = options;
  const { walletClient, account, publicClient } = requireWallet(env);
  const hash = await walletClient.writeContract({
    address: AGENT_IDENTITY_ADDRESS,
    abi: agentIdentityAbi,
    functionName: "registerAgent",
    args: [agentURI],
    account,
    chain: monadTestnet,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const { decodeEventLog } = await import("viem");
  let agentId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: agentIdentityAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "AgentRegistered") {
        agentId = (decoded.args as unknown as { agentId: bigint }).agentId;
        break;
      }
    } catch {
      // Log from another contract in the same receipt; ignore.
    }
  }
  if (agentId === undefined) {
    throw new Error(
      `registerAgent tx ${hash} confirmed but no AgentRegistered event was found in its receipt.`,
    );
  }
  return { agentId, txHash: hash };
}

// ---------------------------------------------------------------------------
// Formatting and explorer links
// ---------------------------------------------------------------------------

/**
 * Render a signed fixed-point summary value with exactly `decimals` fraction
 * digits, e.g. summaryValue=-87e18, decimals=18 -> "-87.000000000000000000".
 */
export function formatReputation(rep: AgentReputation): string {
  const negative = rep.summaryValue < 0n;
  const abs = negative ? -rep.summaryValue : rep.summaryValue;
  const decimals = rep.summaryValueDecimals;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const fraction = abs % scale;
  const sign = negative ? "-" : "";
  return `${sign}${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

/** Explorer link for an agent id (canonical IdentityRegistry on MonadVision). */
export function explorerUrl(agentId: bigint): string {
  const base = monadTestnet.blockExplorers.default.url;
  return `${base}/address/${IDENTITY_REGISTRY_ADDRESS}?tab=token&tokenid=${agentId.toString()}`;
}