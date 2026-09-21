/**
 * Claimless tools shared by the LangChain and Vercel AI SDK adapters.
 *
 * WHY THIS EXISTS
 * ===============
 * Measured evidence (docs/ERC8004_COLDSTART_FINDINGS.md): ERC-8004 has ~828,000
 * agents registered and essentially ZERO reputation feedback. Registration is
 * solved; disclosure is not. One cause is that reporting requires custom
 * integration. These four tool definitions cover the third major agent runtime
 * (LangChain and Vercel AI agent builders) after the MCP server and the
 * MetaMask agent-wallet plugin, over the SAME @claimless/sdk: this is a thin
 * wrapper, not a new client.
 *
 * DESIGN
 * ======
 * Runtime-neutral, zod-based tool definitions with plain async functions.
 * Runtime-specific wrappers live in `langchain.ts` (DynamicStructuredTool) and
 * `vercel.ts` (ai.tool()). Both re-export the same zod schemas so the two
 * runtimes can never drift apart on input validation.
 *
 * The three READ tools need zero configuration: they hit the deployed
 * contracts on Monad testnet (chain 10143) through the SDK's public RPC
 * client. The WRITE tool (report_incident) spends real MON: it needs
 * MONAD_PRIVATE_KEY (or a Privy agent wallet via the SDK's signer stack) and
 * defaults to a dry run that validates and quotes the would-be transaction
 * without sending it.
 *
 * ENV (read tools: nothing needed)
 *   MONAD_RPC_URL       optional, default https://testnet-rpc.monad.xyz
 *   MONAD_PRIVATE_KEY   required only for report_incident with dry_run=false
 */

import { z } from "zod";
import {
  CLAIMLESS_TESTNET,
  ERC8004,
  INCIDENT_KINDS,
  MONAD_TESTNET_CHAIN_ID,
  evidenceHash as evidenceHashOf,
  formatReputation,
  getAcceptedCount,
  getAgentIdentity,
  getIncidents,
  getReputation,
  getScoreBundle,
  kindHash,
  minStake,
  reportIncident as sdkReportIncident,
  totalIncidents,
  type AgentIdentityInfo,
  type OnChainIncident,
  type ScoreBundle,
} from "@claimless/sdk";

/**
 * Deployed addresses (Monad testnet). Kept local to the adapter so it can
 * annotate results without importing viem itself; the SDK reads the same
 * file-derived config, so these are the deployment addresses, not guesses.
 */
export const ADDRESSES = {
  ...CLAIMLESS_TESTNET,
  erc8004Identity: ERC8004.testnet.identity,
  erc8004Reputation: ERC8004.testnet.reputation,
};

/**
 * Recommended incident kind strings. On chain, `kind` is bytes32 =
 * keccak256(utf8 string); the contract accepts any bytes32, so any other
 * string is allowed and hashed on the way in, but these are the canonical
 * vocabulary.
 */
export const INCIDENT_KIND_LIST = INCIDENT_KINDS;

/** The canonical taxonomy tag Claimless writes into ERC-8004 reputation. */
export const INCIDENT_TAG1 = "claimless:incident";

// ---------------------------------------------------------------------------
// Shared zod schemas (single source of truth for BOTH runtime adapters)
// ---------------------------------------------------------------------------

/** ERC-8004 agent id as a decimal string or 0x-hex uint256. */
export const AgentIdSchema = z
  .string()
  .regex(/^(0x[0-9a-fA-F]+|\d+)$/, "agentId must be a decimal string or 0x-hex integer")
  .describe('ERC-8004 agent id (uint256 token id), e.g. "10182".');

export const GetAgentIdentitySchema = z.object({
  agentId: AgentIdSchema,
});
export type GetAgentIdentityInput = z.infer<typeof GetAgentIdentitySchema>;

export const GetAgentRiskSchema = z.object({
  agentId: AgentIdSchema,
});
export type GetAgentRiskInput = z.infer<typeof GetAgentRiskSchema>;

export const ListIncidentsSchema = z.object({
  agentId: AgentIdSchema,
});
export type ListIncidentsInput = z.infer<typeof ListIncidentsSchema>;

export const ReportIncidentSchema = z.object({
  agentId: AgentIdSchema.describe("ERC-8004 agent id the incident is about (uint256)."),
  kind: z
    .string()
    .min(1)
    .describe(
      "Incident kind string, keccak256-hashed before submission. Recommended: " +
        INCIDENT_KIND_LIST.join(", ") +
        ".",
    ),
  severity: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Severity 1 (minor) .. 5 (catastrophic)."),
  evidenceHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "evidenceHash must be a 0x-prefixed 32-byte hex string")
    .optional()
    .describe(
      "Optional bytes32 evidence commitment (0x + 64 hex chars). " +
        "Omit to commit the hash of the provided evidence JSON.",
    ),
  evidence: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Optional evidence payload object. Only keccak256 of its canonical JSON is submitted " +
        "on-chain; the payload itself stays off-chain. Used when evidenceHash is omitted.",
    ),
  stakeMon: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "stakeMon must be a decimal MON amount")
    .optional()
    .describe('Optional stake in MON (decimal string, e.g. "0.01"). Defaults to the contract minStake.'),
  dryRun: z
    .boolean()
    .default(true)
    .describe(
      "DEFAULT TRUE: validate and quote the would-be transaction without sending it. " +
        "Pass false to actually spend the stake and submit the transaction.",
    ),
});
export type ReportIncidentInput = z.infer<typeof ReportIncidentSchema>;

// ---------------------------------------------------------------------------
// Input parsing helpers (agent ids and stakes arrive as strings from LLMs)
// ---------------------------------------------------------------------------

/** Parse a decimal or 0x-hex uint256 string into a bigint, with a clear error. */
export function parseUint256(value: string, label: string): bigint {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a non-empty integer string (e.g. "10182").`);
  }
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    const v = BigInt(trimmed);
    if (v < 0n) throw new Error(`${label} must be a non-negative integer.`);
    return v;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `${label} must be an integer string (decimal, or 0x-prefixed hex), got ${JSON.stringify(value)}.`,
    );
  }
  return BigInt(trimmed);
}

/** Parse a decimal MON string into wei. */
export function parseMon(value: string, label: string): bigint {
  const s = value.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`${label} must be a decimal MON amount, got ${JSON.stringify(value)}.`);
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 18) {
    throw new Error(`${label} has more than 18 decimals.`);
  }
  return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

/** ISO 8601 rendering of a unix seconds timestamp ("" for 0). */
export function isoFromUnix(seconds: number): string {
  if (!seconds) return "";
  try {
    return new Date(seconds * 1000).toISOString();
  } catch {
    return String(seconds);
  }
}

/** Score band, mirroring the SDK's SCORE_BAND_THRESHOLDS. */
export function scoreBand(score: number): "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL" {
  if (score >= 90) return "LOW";
  if (score >= 70) return "MODERATE";
  if (score >= 40) return "ELEVATED";
  return "CRITICAL";
}

// ---------------------------------------------------------------------------
// The four tool implementations (plain async functions; no runtime imports)
// ---------------------------------------------------------------------------

export type ToolResult = Record<string, unknown>;

/** Resolve ERC-8004 identity: owner, agentWallet, tokenURI + explorer link. */
export async function runGetAgentIdentity(input: GetAgentIdentityInput): Promise<ToolResult> {
  const agentId = parseUint256(input.agentId, "agentId");
  const identity: AgentIdentityInfo = await getAgentIdentity(agentId);
  return {
    agentId: identity.agentId.toString(),
    owner: identity.owner,
    agentWallet: identity.agentWallet,
    tokenURI: identity.tokenURI,
    identityRegistry: ADDRESSES.erc8004Identity,
    note: "Canonical ERC-8004 IdentityRegistry on Monad testnet (chain 10143).",
  };
}

/** Live on-chain risk score, accepted counts, and ERC-8004 reputation summary. */
export async function runGetAgentRisk(input: GetAgentRiskInput): Promise<ToolResult> {
  const agentId = parseUint256(input.agentId, "agentId");
  const bundle: ScoreBundle = await getScoreBundle(agentId);
  const [acceptedCount, total] = await Promise.all([getAcceptedCount(agentId), totalIncidents()]);

  let reputation: Awaited<ReturnType<typeof getReputation>> | null = null;
  let reputationNote = "";
  try {
    reputation = await getReputation({
      agentId,
      clients: [CLAIMLESS_TESTNET.agentIdentity],
      tag1: INCIDENT_TAG1,
    });
  } catch (err) {
    reputationNote = ` (ERC-8004 reputation summary unavailable: ${
      err instanceof Error ? err.message : String(err)
    })`;
  }

  return {
    agentId: agentId.toString(),
    riskScore: bundle.score,
    maxScore: bundle.maxScore,
    band: scoreBand(bundle.score),
    acceptedCount: bundle.acceptedCount,
    severitySum: bundle.severitySum,
    acceptedCountRegistry: acceptedCount,
    weights: `acceptedCount*${bundle.freqWeight} + severitySum*${bundle.sevWeight}, floored at 0`,
    registryTotalIncidents: total,
    erc8004Reputation: reputation
      ? {
          count: reputation.count.toString(),
          summaryValue: reputation.summaryValue.toString(),
          summaryValueDecimals: reputation.summaryValueDecimals,
          formatted: formatReputation(reputation),
          tag1: INCIDENT_TAG1,
          note: "negative summaryValue means risk-weighted feedback",
        }
      : null,
    reputationNote,
    chainId: MONAD_TESTNET_CHAIN_ID,
  };
}

/** Incident history for one agent, from IncidentRegistry.getIncidents. */
export async function runListIncidents(input: ListIncidentsInput): Promise<ToolResult> {
  const agentId = parseUint256(input.agentId, "agentId");
  const incidents: OnChainIncident[] = await getIncidents(agentId);
  const total = await totalIncidents();

  return {
    agentId: agentId.toString(),
    incidents: incidents.map((inc) => ({
      id: inc.id.toString(),
      status: inc.status,
      kind: inc.kind,
      severity: inc.severity,
      evidenceHash: inc.evidenceHash,
      stakeWei: inc.stake.toString(),
      reporter: inc.reporter,
      reportedAt: isoFromUnix(inc.reportedAt),
      challengeDeadline: isoFromUnix(inc.challengeDeadline),
      challenger: inc.challenger,
      challengeStakeWei: inc.challengeStake.toString(),
    })),
    incidentCount: incidents.length,
    registryTotalIncidents: total,
    note:
      incidents.length === 0
        ? "An empty history means either a clean record or simply that nobody has reported yet."
        : "kind and evidenceHash are bytes32 commitments; the evidence payload stays off-chain.",
  };
}

/** Result of a dry run: everything that WOULD be sent, nothing sent. */
export interface DryRunPlan {
  /** Index signature so DryRunPlan satisfies ToolResult (Record<string, unknown>). */
  [key: string]: unknown;
  dryRun: true;
  agentId: string;
  kind: string;
  kindHash: `0x${string}`;
  severity: number;
  evidenceHash: `0x${string}`;
  stakeWei: string;
  minStakeWei: string;
  chainId: number;
}

/** Validate + quote the report without sending. Fails on bad input. */
export async function dryRunReportIncident(
  input: ReportIncidentInput,
): Promise<DryRunPlan> {
  const agentId = parseUint256(input.agentId, "agentId");

  // Resolve the evidence commitment: explicit hash wins, else hash the payload.
  let evidenceHashValue: `0x${string}`;
  if (input.evidenceHash) {
    evidenceHashValue = input.evidenceHash as `0x${string}`;
  } else if (input.evidence !== undefined) {
    evidenceHashValue = evidenceHashOf(input.evidence);
  } else {
    throw new Error(
      "Provide either evidenceHash (bytes32 commitment) or evidence (JSON payload; only its " +
        "hash goes on-chain, the payload stays off-chain).",
    );
  }

  const kind = input.kind.trim().toUpperCase();
  const minStakeWei = await minStake();
  const stakeWei = input.stakeMon !== undefined ? parseMon(input.stakeMon, "stakeMon") : minStakeWei;
  if (stakeWei < minStakeWei) {
    throw new Error(
      `Stake ${stakeWei} wei is below minStake ${minStakeWei} wei ` +
        "(the contract would revert with IncidentRegistry__InsufficientStake).",
    );
  }

  // Severity sanity: the SDK validates again on the real path.
  const severity = Number(input.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
    throw new Error(`Invalid severity ${input.severity}: must be an integer 1..5.`);
  }

  return {
    dryRun: true,
    agentId: agentId.toString(),
    kind,
    kindHash: kindHash(kind),
    severity,
    evidenceHash: evidenceHashValue,
    stakeWei: stakeWei.toString(),
    minStakeWei: minStakeWei.toString(),
    chainId: MONAD_TESTNET_CHAIN_ID,
  };
}

/** The write path. Requires MONAD_PRIVATE_KEY; sends a real staked transaction. */
export async function runReportIncident(input: ReportIncidentInput): Promise<ToolResult> {
  // Dry run is the default so an agent cannot spend funds by accident.
  if (input.dryRun) {
    return dryRunReportIncident(input);
  }

  const agentId = parseUint256(input.agentId, "agentId");
  let evidenceHashValue: `0x${string}`;
  if (input.evidenceHash) {
    evidenceHashValue = input.evidenceHash as `0x${string}`;
  } else if (input.evidence !== undefined) {
    evidenceHashValue = evidenceHashOf(input.evidence);
  } else {
    throw new Error(
      "Provide either evidenceHash (bytes32 commitment) or evidence (JSON payload; only its " +
        "hash goes on-chain, the payload stays off-chain).",
    );
  }

  const kind = input.kind.trim().toUpperCase();
  const stakeWei = input.stakeMon !== undefined ? parseMon(input.stakeMon, "stakeMon") : undefined;
  const txHash = await sdkReportIncident({
    agentId,
    kind,
    severity: Number(input.severity),
    evidenceHash: evidenceHashValue,
    stakeWei,
  });

  return {
    submitted: true,
    warning: "REAL TRANSACTION: the stake is bonded and can be lost if a challenge disproves the report.",
    agentId: agentId.toString(),
    kind,
    severity: Number(input.severity),
    evidenceHash: evidenceHashValue,
    stakeMon: input.stakeMon ?? "minStake",
    txHash,
    explorer: `https://testnet.monadvision.com/tx/${txHash}`,
    chainId: MONAD_TESTNET_CHAIN_ID,
  };
}

// ---------------------------------------------------------------------------
// Tool metadata: names, descriptions, zod schemas, destructive flags
// ---------------------------------------------------------------------------

/** One tool definition, shared verbatim by both runtimes. */
export interface ClaimlessToolDef {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  /** true for the write tool: spends funds, submits a transaction. */
  destructive: boolean;
  run: (input: never) => Promise<ToolResult>;
}

export const getAgentIdentityToolDef: ClaimlessToolDef = {
  name: "claimless_get_agent_identity",
  description:
    "Resolve the canonical ERC-8004 identity for an agentId on Monad testnet: the NFT owner " +
    "(operator account), the recorded agentWallet (the wallet the agent itself controls), and " +
    "the registered tokenURI. Read-only, zero configuration.",
  schema: GetAgentIdentitySchema,
  destructive: false,
  run: (input: never) => runGetAgentIdentity(input as GetAgentIdentityInput),
};

export const getAgentRiskToolDef: ClaimlessToolDef = {
  name: "claimless_get_agent_risk",
  description:
    "Read the on-chain risk score for an ERC-8004 agentId on Monad testnet, as published by the " +
    "Claimless RiskScore contract (score = 100 - min(100, acceptedCount*5 + severitySum*2); 100 is " +
    "safest). Returns the score, its band (LOW/MODERATE/ELEVATED/CRITICAL), the accepted incident " +
    "count and severity sum the score is computed from, and the ERC-8004 reputation summary for " +
    "tag 'claimless:incident'. Read-only, zero configuration.",
  schema: GetAgentRiskSchema,
  destructive: false,
  run: (input: never) => runGetAgentRisk(input as GetAgentRiskInput),
};

export const listIncidentsToolDef: ClaimlessToolDef = {
  name: "claimless_list_incidents",
  description:
    "List the on-chain incident history for an ERC-8004 agentId on Monad testnet: id, kind " +
    "(bytes32 keccak256 commitment), severity 1-5, evidenceHash (bytes32 commitment; the evidence " +
    "payload stays off-chain), stake, reporter, status (PENDING/ACCEPTED/REJECTED/CHALLENGED) and " +
    "challenge deadline. Read-only, zero configuration.",
  schema: ListIncidentsSchema,
  destructive: false,
  run: (input: never) => runListIncidents(input as ListIncidentsInput),
};

export const reportIncidentToolDef: ClaimlessToolDef = {
  name: "claimless_report_incident",
  description:
    "WARNING - THIS TOOL SPENDS FUNDS AND SUBMITS A BLOCKCHAIN TRANSACTION. It sends a staked " +
    "incident report to the Claimless IncidentRegistry on Monad testnet: reportIncident(agentId, " +
    "kind, severity, evidenceHash) payable with a stake of at least minStake() MON from " +
    "MONAD_PRIVATE_KEY. The stake is bonded: it can be lost if a challenge disproves the report. " +
    "kind is hashed (keccak256) on the way in - use one of " +
    INCIDENT_KIND_LIST.join(", ") +
    ". evidenceHash is a bytes32 commitment to the evidence payload, which stays off-chain. " +
    "dry_run=true (the default) validates and quotes the plan without sending anything. " +
    "Requires MONAD_PRIVATE_KEY; fails with a clear message if it is not set. " +
    "Only call this when the user explicitly asks to file an incident report.",
  schema: ReportIncidentSchema,
  destructive: true,
  run: (input: never) => runReportIncident(input as ReportIncidentInput),
};

/** All four Claimless tools, in registration order. */
export function claimlessToolDefs(): ClaimlessToolDef[] {
  return [getAgentIdentityToolDef, getAgentRiskToolDef, listIncidentsToolDef, reportIncidentToolDef];
}