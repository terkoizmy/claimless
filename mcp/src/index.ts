#!/usr/bin/env node
/**
 * Claimless MCP server (stdio transport).
 *
 * WHY THIS EXISTS
 * ===============
 * Measured evidence (docs/ERC8004_COLDSTART_FINDINGS.md): ERC-8004 has ~828,000
 * agents registered and essentially ZERO reputation feedback. Registration is
 * solved; disclosure is not. One cause is that reporting requires custom
 * integration - an MCP server removes that cause: if the tool is one line to
 * install, reporting stops needing bespoke work.
 *
 * DESIGN POINT
 * ============
 * The three READ tools are useful before anyone has reported anything: they
 * expose ERC-8004 identity, reputation and risk lookups that already exist
 * on-chain, so the server has value on day one even with a near-empty
 * incident registry.
 *
 * TOOLS (exactly four)
 * ====================
 *  get_agent_identity - read ERC-8004 identity (owner, agentWallet, tokenURI)
 *  get_agent_risk     - read RiskScore.getScoreBundle + accepted incident count
 *  list_incidents     - read IncidentRegistry.getIncidents for an agentId
 *  report_incident    - WRITE: spends funds and submits a transaction
 *
 * CONFIGURATION
 * =============
 * Read tools: no configuration (public Monad testnet RPC by default).
 * Write tool: set MONAD_PRIVATE_KEY (Monad testnet key funded with MON).
 *
 *   MONAD_RPC_URL               optional, default https://testnet-rpc.monad.xyz
 *   MONAD_PRIVATE_KEY           required only for report_incident
 *   CLAIMLESS_DEPLOYMENTS_FILE  optional explicit path to
 *                               contracts/deployments/monad-testnet.json
 *
 * Addresses are read from contracts/deployments/monad-testnet.json at runtime;
 * see src/addresses.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatMon, loadConfig } from "./addresses.js";
import { ClaimlessClient } from "./client.js";
import { evidenceHashFromPayload, INCIDENT_KINDS, kindNameFromHash } from "./kinds.js";

const SERVER_NAME = "claimless";
const SERVER_VERSION = "0.1.0";

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

/** Parse a 0x-prefixed bytes32 string. */
export function parseBytes32(value: string, label: string): `0x${string}` {
  const t = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(t)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte hex string (66 chars), got ${JSON.stringify(value)}.`);
  }
  return t as `0x${string}`;
}

/** ISO 8601 rendering of a unix seconds timestamp ("" for 0). */
function isoFromUnix(seconds: number): string {
  if (!seconds) return "";
  try {
    return new Date(seconds * 1000).toISOString();
  } catch {
    return String(seconds);
  }
}

/** Score band, mirroring sdk/src/risk.ts SCORE_BAND_THRESHOLDS. */
function scoreBand(score: number): string {
  if (score >= 90) return "LOW";
  if (score >= 70) return "MODERATE";
  if (score >= 40) return "ELEVATED";
  return "CRITICAL";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new ClaimlessClient({
    addresses: config.addresses,
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
  });

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Claimless: on-chain AI agent risk data on Monad testnet. The three read tools " +
        "(get_agent_identity, get_agent_risk, list_incidents) work with no configuration and " +
        "are useful even with an empty incident registry because ERC-8004 identity and risk " +
        "data already exist on-chain. report_incident is a WRITE tool: it spends MON " +
        "(the incident stake) and submits a real transaction; call it only when the user " +
        "explicitly asks to file an incident report, and pass dry_run=true to validate first.",
    },
  );

  // -----------------------------------------------------------------------
  // get_agent_identity - ERC-8004 identity resolution (canonical registry)
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_agent_identity",
    {
      title: "Resolve ERC-8004 agent identity",
      description:
        "Resolve the canonical ERC-8004 identity for an agentId on Monad testnet: the NFT owner " +
        "(operator account), the recorded agentWallet (the wallet the agent itself controls), and " +
        "the registered tokenURI. Reads the canonical ERC-8004 IdentityRegistry directly; " +
        "no configuration required, no data needed beyond the agentId.",
      inputSchema: {
        agentId: z
          .string()
          .describe("ERC-8004 agent id (uint256 token id in the canonical IdentityRegistry), e.g. \"10182\"."),
      },
      annotations: {
        title: "Get agent identity",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentId }) => {
      const id = parseUint256(agentId, "agentId");
      const identity = await client.getAgentIdentity(id);
      let explorerUrl: string;
      try {
        explorerUrl = `https://testnet.monadvision.com/address/${config.addresses.erc8004Identity}?tab=token&tokenid=${id.toString()}`;
      } catch {
        explorerUrl = "";
      }
      return {
        content: [
          {
            type: "text" as const,
            text:
              `agentId ${identity.agentId}\n` +
              `owner: ${identity.owner}\n` +
              `agentWallet: ${identity.agentWallet}\n` +
              `tokenURI: ${identity.tokenURI}\n` +
              `identityRegistry: ${config.addresses.erc8004Identity} (canonical ERC-8004)\n` +
              `explorer: ${explorerUrl}`,
        },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_agent_risk - live on-chain risk score + accepted incident count
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_agent_risk",
    {
      title: "Get agent risk score",
      description:
        "Read the on-chain risk score for an ERC-8004 agentId on Monad testnet, as published by the " +
        "Claimless RiskScore contract (score = 100 - min(100, acceptedCount*5 + severitySum*2); 100 is " +
        "safest). Returns the score, its band (LOW/MODERATE/ELEVATED/CRITICAL), the accepted incident " +
        "count and severity sum the score is computed from, the live registry inputs, and the ERC-8004 " +
        "reputation summary for tag 'claimless:incident'. Works with zero configuration.",
      inputSchema: {
        agentId: z
          .string()
          .describe("ERC-8004 agent id (uint256 token id in the canonical IdentityRegistry), e.g. \"10182\"."),
      },
      annotations: {
        title: "Get agent risk",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentId }) => {
      const id = parseUint256(agentId, "agentId");
      const bundle = await client.getScoreBundle(id);
      const [acceptedCount, totalIncidents] = await Promise.all([
        client.getAcceptedCount(id),
        client.totalIncidents(),
      ]);
      let reputation: Awaited<ReturnType<typeof client.getReputationSummary>> | null = null;
      let reputationNote = "";
      try {
        reputation = await client.getReputationSummary(
          id,
          [config.addresses.agentIdentity],
          "claimless:incident",
        );
      } catch (err) {
        reputationNote =
          " (ERC-8004 reputation summary unavailable: " +
          `${err instanceof Error ? err.message : String(err)})`;
      }

      const lines = [
        `agentId: ${id.toString()}`,
        `riskScore (RiskScore contract, live): ${bundle.score} / ${bundle.maxScore} (${scoreBand(bundle.score)})`,
        `acceptedCount: ${bundle.acceptedCount} (IncidentRegistry.getAcceptedCount: ${acceptedCount})`,
        `severitySum: ${bundle.severitySum}`,
        `weights: acceptedCount*${bundle.freqWeight} + severitySum*${bundle.sevWeight}, floored at 0`,
        `registry totalIncidents (all agents): ${totalIncidents}`,
      ];
      if (reputation) {
        lines.push(
          `erc8004Reputation (clients=[Claimless adapter], tag1="claimless:incident"): ` +
            `count=${reputation.count}, summaryValue=${reputation.summaryValue} ` +
            `(decimals=${reputation.summaryValueDecimals}; negative means risk-weighted feedback)`,
        );
      } else {
        lines.push(`erc8004Reputation: unavailable${reputationNote}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_incidents - incident history with evidence hashes and statuses
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_incidents",
    {
      title: "List incidents for an agent",
      description:
        "List the on-chain incident history for an ERC-8004 agentId on Monad testnet: id, kind " +
        "(as its bytes32 keccak256 commitment), severity 1-5, evidenceHash (bytes32 commitment; the " +
        "evidence payload stays off-chain), stake, reporter, status (PENDING/ACCEPTED/REJECTED/CHALLENGED) " +
        "and challenge deadline. Read-only, zero configuration.",
      inputSchema: {
        agentId: z
          .string()
          .describe("ERC-8004 agent id (uint256 token id in the canonical IdentityRegistry), e.g. \"10182\"."),
      },
      annotations: {
        title: "List incidents",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentId }) => {
      const id = parseUint256(agentId, "agentId");
      const incidents = await client.getIncidents(id);

      if (incidents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `No incidents recorded for agentId ${id.toString()}. ` +
                `Registry-wide totalIncidents: ${await client.totalIncidents()}. ` +
                "An empty history means either a clean record or simply that nobody has reported yet.",
            },
          ],
        };
      }

      const lines: string[] = [`agentId: ${id.toString()}`, `incidents: ${incidents.length}`];
      for (const inc of incidents) {
        const known = kindNameFromHash(inc.kind);
        lines.push(
          `- id=${inc.id} status=${inc.status} kind=${inc.kind}${known ? ` (${known})` : ""} severity=${inc.severity}/5 ` +
            `stake=${formatMon(BigInt(inc.stake))} reportedAt=${isoFromUnix(inc.reportedAt)}`,
          `  evidenceHash=${inc.evidenceHash}`,
          `  reporter=${inc.reporter}`,
          inc.challenger
            ? `  challenger=${inc.challenger} challengeStake=${inc.challengeStake} challengeDeadline=${isoFromUnix(inc.challengeDeadline)}`
            : `  challengeDeadline=${isoFromUnix(inc.challengeDeadline)} (no challenger)`,
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // report_incident - WRITE: staked, on-chain incident report
  // -----------------------------------------------------------------------
  server.registerTool(
    "report_incident",
    {
      title: "Report an incident (spends funds, submits a transaction)",
      description:
        "WARNING - THIS TOOL SPENDS FUNDS AND SUBMITS A BLOCKCHAIN TRANSACTION. It sends a staked " +
        "incident report to the Claimless IncidentRegistry on Monad testnet: reportIncident(agentId, " +
        "kind, severity, evidenceHash) payable with a stake of at least minStake() MON from " +
        "MONAD_PRIVATE_KEY. The stake is bonded: it can be lost if a challenge disproves the report. " +
        "kind is hashed (keccak256) on the way in - use one of SLA_BREACH, WRONG_OUTPUT, LATENCY, " +
        "UNAVAILABLE, UNAUTHORIZED_ACTION, DATA_LEAK. evidenceHash is a bytes32 commitment to the " +
        "evidence payload, which stays off-chain. dry_run=true validates and quotes the plan without " +
        "sending anything. Requires MONAD_PRIVATE_KEY; fails with a clear message if it is not set. " +
        "Only call this when the user explicitly asks to file an incident report.",
      inputSchema: {
        agentId: z
          .string()
          .describe("ERC-8004 agent id the incident is about (uint256), e.g. \"10182\"."),
        kind: z
          .string()
          .describe(
            `Incident kind string, keccak256-hashed before submission. Recommended: ${INCIDENT_KINDS.join(", ")}.`,
          ),
        severity: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe("Severity 1 (minor) .. 5 (catastrophic)."),
        evidenceHash: z
          .string()
          .regex(/^0x[0-9a-fA-F]{64}$/)
          .optional()
          .describe(
            "Optional bytes32 evidence commitment (0x + 64 hex chars). " +
              "Omit to commit the hash of the provided evidence JSON.",
          ),
        evidence: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional evidence payload object. Only keccak256(JSON.stringify) of it is submitted " +
              "on-chain; the payload itself stays off-chain. Used when evidenceHash is omitted.",
          ),
        stakeMon: z
          .string()
          .optional()
          .describe("Optional stake in MON (decimal string, e.g. \"0.01\"). Defaults to the contract minStake."),
        dryRun: z
          .boolean()
          .default(true)
          .describe(
            "Default true: validate and return the would-be transaction without sending it. " +
              "Pass false to actually spend the stake and submit the transaction.",
          ),
      },
      annotations: {
        title: "Report incident (spends funds)",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const agentId = parseUint256(args.agentId, "agentId");
      const kind = args.kind.trim().toUpperCase();

      // Resolve the evidence commitment: explicit hash wins, else hash the payload.
      let evidenceHash: `0x${string}`;
      if (args.evidenceHash) {
        evidenceHash = parseBytes32(args.evidenceHash, "evidenceHash");
      } else if (args.evidence !== undefined) {
        evidenceHash = evidenceHashFromPayload(args.evidence);
      } else {
        throw new Error(
          "Provide either evidenceHash (bytes32 commitment) or evidence (JSON payload; only its " +
            "hash goes on-chain, the payload stays off-chain).",
        );
      }

      let stakeWeiValue: bigint | undefined;
      if (args.stakeMon !== undefined) {
        const s = args.stakeMon.trim();
        if (!/^\d+(\.\d+)?$/.test(s)) {
          throw new Error(`stakeMon must be a decimal MON amount, got ${JSON.stringify(args.stakeMon)}.`);
        }
        const [whole, frac = ""] = s.split(".");
        if (frac.length > 18) {
          throw new Error("stakeMon has more than 18 decimals.");
        }
        stakeWeiValue = BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
      }

      const result = await client.reportIncident({
        agentId,
        kind,
        severity: args.severity,
        evidenceHash,
        stakeWei: stakeWeiValue,
        dryRun: args.dryRun,
      });

      const lines = [
        result.dryRun
          ? "DRY RUN (nothing was sent; pass dry_run=false to submit):"
          : "Incident report SUBMITTED on Monad testnet:",
        `agentId: ${result.agentId}`,
        `kind: ${result.kind} (kindHash ${result.kindHash})`,
        `severity: ${result.severity}/5`,
        `evidenceHash: ${result.evidenceHash}`,
        `stake: ${result.stakeMon} (minStake: ${formatMon(BigInt(result.minStakeWei))})`,
      ];
      if (result.dryRun) {
        const window = await client.challengeWindow();
        lines.push(
          `challengeWindow: ${window.toString()} seconds (${(Number(window) / 86400).toFixed(0)} days) - validated, no tx sent`,
        );
      } else {
        lines.push(
          `incidentId: ${result.incidentId ?? "(not decoded)"}`,
          `reporter: ${result.reporter}`,
          `txHash: ${result.txHash}`,
          `block: ${result.blockNumber}`,
          `explorer: ${result.explorerUrl}`,
          "The stake is bonded until the challenge window passes; a disproven report loses it.",
        );
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // stdio transport
  // -----------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Never console.log to stdout in an MCP stdio server: stdout is the protocol.
  if (process.env.CLAIMLESS_MCP_DEBUG === "1") {
    console.error(
      `[claimless-mcp] ready: chain=10143 rpc=${config.rpcUrl} deployments=${config.deploymentsSource}`,
    );
  }
}

main().catch((err) => {
  console.error("[claimless-mcp] fatal:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});