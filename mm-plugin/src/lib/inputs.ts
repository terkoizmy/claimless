/**
 * Shared helpers for the Claimless commands: input parsing, result types,
 * on-chain reads via the host's authenticated viem client, and error wrapping.
 */

import { CommandError } from "@metamask/agent-wallet/plugin";
import { keccak256, stringToHex, type Abi, type PublicClient } from "viem";
import { TAG1_INCIDENT } from "./config.js";
import {
  AGENT_IDENTITY_ABI,
  IDENTITY_REGISTRY_ABI,
  INCIDENT_REGISTRY_ABI,
  RISK_SCORE_ABI,
} from "./abis.js";

/** Local error code for bad user input. */
const BAD_INPUT = "INVALID_INPUT";
/** Shared recovery hint. */
const FIX_INPUT_HINT = "Fix the input and try again.";

/** Parse a non-negative integer agent id out of a user string. */
export function parseAgentId(raw: string): bigint {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new CommandError(
      BAD_INPUT,
      `Invalid agentId "${trimmed}": must be a non-negative integer ERC-8004 token id (e.g. 42).`,
      FIX_INPUT_HINT,
    );
  }
  return BigInt(trimmed);
}

/** Parse severity 1..5 with a clear message (contract reverts otherwise). */
export function parseSeverity(raw: string): number {
  const trimmed = raw.trim();
  if (!/^[1-5]$/.test(trimmed)) {
    throw new CommandError(
      BAD_INPUT,
      `Invalid severity "${trimmed}": must be an integer 1..5 ` +
        "(1=minor, 2=moderate, 3=major, 4=severe, 5=catastrophic).",
      FIX_INPUT_HINT,
    );
  }
  return Number.parseInt(trimmed, 10);
}

/** Parse a 0x-prefixed 32-byte evidence hash (accepts a 0x hash or keccak of a string). */
export function parseEvidenceHash(raw: string): `0x${string}` {
  const trimmed = raw.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase() as `0x${string}`;
  }
  // Convenience: hash a plain string (e.g. a URI or payload) with keccak256.
  if (/^0x[0-9a-fA-F]+$/.test(trimmed) && trimmed.length > 2) {
    throw new CommandError(
      BAD_INPUT,
      `Invalid evidenceHash: 0x-prefixed hex must be exactly 64 hex chars (32 bytes), got ${trimmed.length - 2}.`,
      FIX_INPUT_HINT,
    );
  }
  if (trimmed.length === 0) {
    throw new CommandError(
      BAD_INPUT,
      "evidenceHash is required (0x + 64 hex chars).",
      FIX_INPUT_HINT,
    );
  }
  return keccak256(stringToHex(trimmed));
}

/** Parse a wei amount (integer string). */
export function parseWei(raw: string): bigint {
  const trimmed = raw.trim().toLowerCase();
  if (!/^\d+$/.test(trimmed)) {
    throw new CommandError(
      BAD_INPUT,
      `Invalid stake "${trimmed}": must be a whole wei amount, e.g. 10000000000000000 for 0.01 MON.`,
      FIX_INPUT_HINT,
    );
  }
  return BigInt(trimmed);
}

/** keccak256 of the kind string, matching sdk/src/hash.ts#kindHash. */
export function kindHash(kind: string): `0x${string}` {
  return keccak256(stringToHex(kind));
}

/** Try to extract a readable message from an arbitrary viem/unknown error. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const short = err.message.split("\n")[0];
    return short.length > 300 ? `${short.slice(0, 300)}…` : short;
  }
  return String(err);
}

/** Run a readContract and wrap reverts in a CommandError naming the call. */
export async function readContractSafe<T>(
  client: PublicClient,
  params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    label: string;
  },
): Promise<T> {
  try {
    return (await client.readContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as never,
    })) as T;
  } catch (err) {
    throw new CommandError("CONTRACT_READ_FAILED", `${params.label} failed: ${describeError(err)}`, "Check network status and the contract address, then retry.");
  }
}

/** Result payload of `claimless risk`. */
export interface RiskResult {
  command: "claimless:risk";
  chainId: number;
  agentId: string;
  riskScore: number;
  scoreBand: string;
  acceptedCount: number;
  severitySum: number;
  /** Total reports filed (any status); -1 when the read is unavailable. */
  incidentCount: number;
  sources: {
    riskScore: string;
    incidentRegistry: string;
  };
}

/** Result payload of `claimless agent`. */
export interface AgentResult {
  command: "claimless:agent";
  chainId: number;
  agentId: string;
  owner: string;
  agentWallet: string | null;
  reputation: {
    count: number;
    summaryValue: string;
    decimals: number;
    rendered: string;
    tag1: string;
  };
  sources: {
    identityRegistry: string;
    reputationRegistry: string;
    /** AgentIdentity adapter that publishes the Claimless summaries. */
    agentIdentity: string;
  };
}

/** Result payload of `claimless report`. */
export interface ReportResult {
  command: "claimless:report";
  chainId: number;
  incidentId: string;
  agentId: string;
  kind: string;
  kindHash: string;
  severity: number;
  evidenceHash: string;
  stakeWei: string;
  transactionHash: string | null;
  status: string;
  incidentRegistry: string;
  note: string;
}

/**
 * `claimless risk <agentId>` core: live risk score from RiskScore.getScoreBundle
 * plus the incident counts behind it, read directly from Monad testnet through
 * the host's authenticated per-chain client (wallet-read capability).
 */
export async function readRisk(
  client: PublicClient,
  addresses: { riskScore: `0x${string}`; incidentRegistry: `0x${string}` },
  chainId: number,
  agentId: bigint,
): Promise<RiskResult> {
  const [bundle, incidentCount] = await Promise.all([
    readContractSafe<[bigint, bigint, bigint]>(client, {
      address: addresses.riskScore,
      abi: RISK_SCORE_ABI,
      functionName: "getScoreBundle",
      args: [agentId],
      label: `RiskScore.getScoreBundle(${agentId})`,
    }),
    readContractSafe<bigint>(client, {
      address: addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getIncidentCount",
      args: [agentId],
      label: `IncidentRegistry.getIncidentCount(${agentId})`,
    }).catch(() => -1n),
  ]);

  const [scoreRaw, acceptedCount, severitySum] = bundle;
  const score = Number(scoreRaw);

  return {
    command: "claimless:risk",
    chainId,
    agentId: agentId.toString(),
    riskScore: score,
    scoreBand: scoreBandFor(score),
    acceptedCount: Number(acceptedCount),
    severitySum: Number(severitySum),
    incidentCount: Number(incidentCount),
    sources: {
      riskScore: addresses.riskScore,
      incidentRegistry: addresses.incidentRegistry,
    },
  };
}

/** Band label for a 0..100 score (mirrors sdk/src/risk.ts thresholds). */
function scoreBandFor(score: number): "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL" {
  if (score >= 90) return "LOW";
  if (score >= 70) return "MODERATE";
  if (score >= 40) return "ELEVATED";
  return "CRITICAL";
}

/**
 * `claimless agent <agentId>` core: canonical ERC-8004 identity (owner +
 * agent wallet) plus the Claimless-published reputation summary. The canonical
 * registry is the source of truth; the adapter read is advisory and degrades
 * gracefully when unavailable.
 */
export async function readAgent(
  client: PublicClient,
  addresses: {
    agentIdentity: `0x${string}`;
    identityRegistry: `0x${string}`;
    reputationRegistry: `0x${string}`;
  },
  chainId: number,
  agentId: bigint,
): Promise<AgentResult> {
  // ownerOf reverts for an unregistered id: exactly the "agent not found" signal.
  const owner = await readContractSafe<`0x${string}`>(client, {
    address: addresses.identityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "ownerOf",
    args: [agentId],
    label: `IdentityRegistry.ownerOf(${agentId})`,
  });

  const [agentWallet, risk] = await Promise.all([
    readContractSafe<`0x${string}`>(client, {
      address: addresses.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getAgentWallet",
      args: [agentId],
      label: `IdentityRegistry.getAgentWallet(${agentId})`,
    }).catch(() => null),
    readContractSafe<[bigint, bigint, number]>(client, {
      address: addresses.agentIdentity,
      abi: AGENT_IDENTITY_ABI,
      functionName: "getAgentRisk",
      args: [agentId],
      label: `AgentIdentity.getAgentRisk(${agentId})`,
    }).catch(() => null),
  ]);

  const reputation: AgentResult["reputation"] =
    risk === null
      ? {
          count: -1,
          summaryValue: "unavailable",
          decimals: -1,
          rendered: "unavailable",
          tag1: TAG1_INCIDENT,
        }
      : {
          count: Number(risk[0]),
          summaryValue: risk[1].toString(),
          decimals: risk[2],
          rendered: formatSignedFixedPoint(risk[1], risk[2]),
          tag1: TAG1_INCIDENT,
        };

  return {
    command: "claimless:agent",
    chainId,
    agentId: agentId.toString(),
    owner,
    agentWallet,
    reputation,
    sources: {
      identityRegistry: addresses.identityRegistry,
      reputationRegistry: addresses.reputationRegistry,
      agentIdentity: addresses.agentIdentity,
    },
  };
}

/** Format a signed fixed-point int128 value for display. */
export function formatSignedFixedPoint(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  if (decimals <= 0) {
    return `${negative ? "-" : ""}${abs.toString()}`;
  }
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, 4);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}