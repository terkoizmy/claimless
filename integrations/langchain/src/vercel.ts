/**
 * Vercel AI SDK adapters for the Claimless tools.
 *
 * Wraps the shared `tools.ts` definitions into Vercel AI SDK `tool()`s
 * (from the `ai` package) with the same zod schemas, so both runtimes
 * validate identically. `execute` returns plain objects (the AI SDK
 * serialises them into tool results). Usable with `generateText`,
 * `streamText`, and agent loops that accept a `tools` record.
 *
 * ```ts
 * import { claimlessVercelTools } from "@claimless/langchain-tools/vercel";
 * const tools = claimlessVercelTools(); // { identity, risk, incidents, report }
 * ```
 *
 * Type note: `execute` is declared without an explicit return annotation so
 * it satisfies ai@4's covariant `ToolResultPart` shape AND ai@5+/7's
 * `ToolCallOptions`-aware signature across SDK generations.
 */

import { tool, type ToolSet } from "ai";
import type { z } from "zod";
import {
  GetAgentIdentitySchema,
  GetAgentRiskSchema,
  ListIncidentsSchema,
  ReportIncidentSchema,
  runGetAgentIdentity,
  runGetAgentRisk,
  runListIncidents,
  runReportIncident,
  type GetAgentIdentityInput,
  type GetAgentRiskInput,
  type ListIncidentsInput,
  type ReportIncidentInput,
} from "./tools.js";

/**
 * All four Claimless tools as a Vercel AI SDK ToolSet.
 *
 * Shape note: the installed `ai` (v7) names the schema key `inputSchema`
 * (it also accepts `parameters` as a deprecated alias on some versions, but
 * `inputSchema` is the v7 spelling; v4 used `parameters`). The write tool
 * defaults to dry_run=true: it validates and quotes without spending.
 * Spending requires dry_run=false in the input AND a funded
 * MONAD_PRIVATE_KEY in the environment.
 */
export function claimlessVercelTools(): ToolSet {
  return {
    claimless_get_agent_identity: tool({
      description:
        "Resolve the canonical ERC-8004 identity for an agentId on Monad testnet: the NFT owner " +
        "(operator account), the recorded agentWallet (the wallet the agent itself controls), and " +
        "the registered tokenURI. Read-only, zero configuration.",
      inputSchema: GetAgentIdentitySchema,
      execute: async (input: GetAgentIdentityInput) => runGetAgentIdentity(input),
    }),
    claimless_get_agent_risk: tool({
      description:
        "Read the on-chain risk score for an ERC-8004 agentId on Monad testnet, as published by the " +
        "Claimless RiskScore contract (score = 100 - min(100, acceptedCount*5 + severitySum*2); 100 is " +
        "safest). Returns the score, its band (LOW/MODERATE/ELEVATED/CRITICAL), the accepted incident " +
        "count and severity sum the score is computed from, and the ERC-8004 reputation summary for " +
        "tag 'claimless:incident'. Read-only, zero configuration.",
      inputSchema: GetAgentRiskSchema,
      execute: async (input: GetAgentRiskInput) => runGetAgentRisk(input),
    }),
    claimless_list_incidents: tool({
      description:
        "List the on-chain incident history for an ERC-8004 agentId on Monad testnet: id, kind " +
        "(bytes32 keccak256 commitment), severity 1-5, evidenceHash (bytes32 commitment; the evidence " +
        "payload stays off-chain), stake, reporter, status (PENDING/ACCEPTED/REJECTED/CHALLENGED) and " +
        "challenge deadline. Read-only, zero configuration.",
      inputSchema: ListIncidentsSchema,
      execute: async (input: ListIncidentsInput) => runListIncidents(input),
    }),
    claimless_report_incident: tool({
      description:
        "WARNING - THIS TOOL SPENDS FUNDS AND SUBMITS A BLOCKCHAIN TRANSACTION. It sends a staked " +
        "incident report to the Claimless IncidentRegistry on Monad testnet: reportIncident(agentId, " +
        "kind, severity, evidenceHash) payable with a stake of at least minStake() MON from " +
        "MONAD_PRIVATE_KEY. The stake is bonded: it can be lost if a challenge disproves the report. " +
        "kind is hashed (keccak256) on the way in. evidenceHash is a bytes32 commitment to the " +
        "evidence payload, which stays off-chain. dry_run=true (the default) validates and quotes " +
        "the plan without sending anything. Requires MONAD_PRIVATE_KEY. Only call this when the " +
        "user explicitly asks to file an incident report.",
      inputSchema: ReportIncidentSchema,
      execute: async (input: ReportIncidentInput) => runReportIncident(input),
    }),
  };
}

/**
 * Only the three read-only tools, for hosts that want to expose no
 * fund-spending surface at all.
 */
export function claimlessVercelReadTools(): ToolSet {
  const all = claimlessVercelTools();
  const { claimless_report_incident: _report, ...readTools } = all;
  return readTools;
}

/**
 * The write tool on its own, so hosts can gate it behind explicit user
 * confirmation and merge it back when approved.
 */
export function claimlessVercelReportTool(): ToolSet {
  const all = claimlessVercelTools();
  return { claimless_report_incident: all.claimless_report_incident };
}

/** Schema type re-export for callers composing their own tool() calls. */
export type { z };