/**
 * Live tests for the Claimless LangChain/Vercel tool adapters.
 *
 * NO MOCKS. The read tools hit the real Monad testnet RPC (chain 10143)
 * through the SDK's public client, and assert against known on-chain state:
 * agent 10182 has an ACCEPTED incident and a live score of 87; agent 1867
 * has a live score of 100. If the RPC or contracts are unreachable the
 * tests FAIL; they never fake a value.
 *
 * The write tool is asserted to REJECT with a clear message when no signer
 * is configured (no MONAD_PRIVATE_KEY), and to dry-run without spending.
 */

import { afterAll, describe, expect, it } from "vitest";
import {
  ReportIncidentSchema,
  claimlessToolDefs,
  runGetAgentIdentity,
  runGetAgentRisk,
  runListIncidents,
  runReportIncident,
} from "../src/tools.js";
import { claimlessLangChainTools } from "../src/langchain.js";
import { claimlessVercelTools } from "../src/vercel.js";

/** Saved env so the no-signer assertions are real even on machines that have one. */
const SAVED_KEY = process.env.MONAD_PRIVATE_KEY;

afterAll(() => {
  if (SAVED_KEY !== undefined) process.env.MONAD_PRIVATE_KEY = SAVED_KEY;
});

// Guard every write-path test: run with NO signer configured, ever.
function ensureNoSigner(): void {
  delete process.env.MONAD_PRIVATE_KEY;
}

// ---------------------------------------------------------------------------
// Read tools against the LIVE chain
// ---------------------------------------------------------------------------

describe("claimless_get_agent_risk (live Monad testnet RPC)", () => {
  it("returns the live score 87 for agent 10182", async () => {
    const result = await runGetAgentRisk({ agentId: "10182" });
    expect(result.agentId).toBe("10182");
    expect(result.riskScore).toBe(87);
    expect(result.maxScore).toBe(100);
    expect(result.band).toBe("MODERATE");
    expect(result.acceptedCount).toBeGreaterThan(0);
    expect(result.chainId).toBe(10143);
  });

  it("returns the live score 100 for agent 1867", async () => {
    const result = await runGetAgentRisk({ agentId: "1867" });
    expect(result.agentId).toBe("1867");
    expect(result.riskScore).toBe(100);
    expect(result.band).toBe("LOW");
  });
});

describe("claimless_get_agent_identity (live Monad testnet RPC)", () => {
  it("resolves the canonical ERC-8004 identity for agent 1867", async () => {
    const result = await runGetAgentIdentity({ agentId: "1867" });
    expect(result.agentId).toBe("1867");
    expect(result.owner).toBe("0xF601a214CF0FFf4741e7DD405FB5A75B46388395");
    expect(String(result.agentWallet)).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(typeof result.tokenURI).toBe("string");
    expect(result.identityRegistry).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e");
  });

  it("throws a real error for a nonexistent agent id (no fake data)", async () => {
    await expect(runGetAgentIdentity({ agentId: "999999999999" })).rejects.toThrow(/ownerOf|ERC721|does not|revert/i);
  });

  it("throws for agent 10182: not registered in the canonical IdentityRegistry", async () => {
    // Real chain state: 10182 has a Claimless risk score but no ERC-8004 identity token.
    await expect(runGetAgentIdentity({ agentId: "10182" })).rejects.toThrow();
  });
});

describe("claimless_list_incidents (live Monad testnet RPC)", () => {
  it("returns at least one ACCEPTED incident for agent 10182", async () => {
    const result = await runListIncidents({ agentId: "10182" });
    expect(result.incidentCount).toBeGreaterThan(0);
    const list = result.incidents as Array<Record<string, unknown>>;
    expect(list.some((i) => i.status === "ACCEPTED")).toBe(true);
    const first = list[0];
    expect(String(first["evidenceHash"])).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(String(first["reporter"])).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(Number(first["severity"])).toBeGreaterThanOrEqual(1);
    expect(Number(first["severity"])).toBeLessThanOrEqual(5);
  });

  it("reads a clean agent without fabricating incidents", async () => {
    const result = await runListIncidents({ agentId: "1867" });
    expect(result.incidentCount).toBe(0);
    expect(result.registryTotalIncidents).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Write tool: dry run works, real send refuses without a signer
// ---------------------------------------------------------------------------

describe("claimless_report_incident (write tool safety)", () => {
  it("dry run validates and quotes the plan without sending", async () => {
    ensureNoSigner();
    const plan = await runReportIncident({
      agentId: "10182",
      kind: "SLA_BREACH",
      severity: 3,
      evidence: { test: "adapter-dry-run", at: new Date().toISOString() },
      dryRun: true,
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.agentId).toBe("10182");
    expect(plan.kind).toBe("SLA_BREACH");
    expect(String(plan.kindHash)).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(String(plan.evidenceHash)).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(BigInt(String(plan.stakeWei))).toBe(BigInt(String(plan.minStakeWei)));
    expect(plan.chainId).toBe(10143);
  });

  it("rejects the real send with a clear signer error when no MONAD_PRIVATE_KEY is set", async () => {
    ensureNoSigner();
    await expect(
      runReportIncident({
        agentId: "10182",
        kind: "SLA_BREACH",
        severity: 3,
        evidence: { test: "adapter-no-signer" },
        dryRun: false,
      }),
    ).rejects.toThrow(/No signer configured|MONAD_PRIVATE_KEY/);
  });

  it("rejects a stake below minStake during dry run", async () => {
    ensureNoSigner();
    await expect(
      runReportIncident({
        agentId: "10182",
        kind: "SLA_BREACH",
        severity: 3,
        evidence: { test: "adapter-low-stake" },
        stakeMon: "0.000000000000000001",
        dryRun: true,
      }),
    ).rejects.toThrow(/below minStake|InsufficientStake/);
  });

  it("rejects an invalid severity during dry run", async () => {
    ensureNoSigner();
    await expect(
      runReportIncident({
        agentId: "10182",
        kind: "SLA_BREACH",
        severity: 9,
        evidence: { test: "adapter-bad-severity" },
        dryRun: true,
      }),
    ).rejects.toThrow(/severity/i);
  });

  it("schema parses dryRun default to true", () => {
    const parsed = ReportIncidentSchema.parse({
      agentId: "10182",
      kind: "SLA_BREACH",
      severity: 2,
      evidence: { test: "schema-default" },
    });
    expect(parsed.dryRun).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Runtime adapters share the same definitions
// ---------------------------------------------------------------------------

describe("runtime adapters expose the same four tools", () => {
  it("shared defs: exactly four, write tool flagged destructive", () => {
    const defs = claimlessToolDefs();
    expect(defs.map((d) => d.name)).toEqual([
      "claimless_get_agent_identity",
      "claimless_get_agent_risk",
      "claimless_list_incidents",
      "claimless_report_incident",
    ]);
    expect(defs.filter((d) => d.destructive)).toHaveLength(1);
    expect(defs[3].destructive).toBe(true);
    expect(defs[3].description).toMatch(/SPENDS FUNDS/i);
  });

  it("LangChain wrappers expose the same names and schemas", () => {
    const tools = claimlessLangChainTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual(claimlessToolDefs().map((d) => d.name));
  });

  it("LangChain write tool rejects without a signer through the wrapper", async () => {
    ensureNoSigner();
    const tools = claimlessLangChainTools();
    const report = tools.find((t) => t.name === "claimless_report_incident");
    expect(report).toBeDefined();
    const out = await report!.invoke({
      agentId: "10182",
      kind: "SLA_BREACH",
      severity: 3,
      evidence: { test: "langchain-no-signer" },
      dryRun: false,
    });
    expect(out).toContain("No signer configured");
  });

  it("Vercel wrappers expose the same four keys", () => {
    const tools = claimlessVercelTools();
    expect(Object.keys(tools).sort()).toEqual([...claimlessToolDefs().map((d) => d.name)].sort());
  });

  it("Vercel write tool rejects without a signer through execute", async () => {
    ensureNoSigner();
    const tools = claimlessVercelTools();
    const report = tools["claimless_report_incident"] as unknown as {
      execute: (input: unknown) => Promise<unknown>;
    };
    await expect(
      report.execute({
        agentId: "10182",
        kind: "SLA_BREACH",
        severity: 3,
        evidence: { test: "vercel-no-signer" },
        dryRun: false,
      }),
    ).rejects.toThrow(/No signer configured|MONAD_PRIVATE_KEY/);
  });
});