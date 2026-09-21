# @claimless/langchain-tools

Claimless agent tools for **LangChain** and the **Vercel AI SDK** — thin wrappers over the same `@claimless/sdk` used by the MCP server and the MetaMask agent-wallet plugin.

**Why it exists** (docs/COLDSTART_DISTRIBUTION_STRATEGY.md): ERC-8004 has ~828,000 agents registered and essentially zero reputation feedback. Reporting currently requires custom integration; this adapter removes that cause for the third major agent runtime: if the tool is one line to install, reporting stops needing bespoke work.

The three READ tools are useful **before anyone has reported anything**: they expose ERC-8004 identity, risk, and incident lookups that already exist on-chain (Monad testnet, chain 10143), so the adapter has value on day one even with a near-empty incident registry.

## Tools (exactly four)

| Tool | Type | What it does |
|---|---|---|
| `claimless_get_agent_identity` | read | Resolve ERC-8004 identity for an agentId: owner, agentWallet, tokenURI (canonical IdentityRegistry). |
| `claimless_get_agent_risk` | read | Live `RiskScore.getScoreBundle` (score/band), accepted incident count, severity sum, ERC-8004 reputation summary for tag `claimless:incident`. |
| `claimless_list_incidents` | read | Incident history for an agentId: id, kind (bytes32 commitment), severity, evidenceHash, stake, reporter, status, challenge deadline. |
| `claimless_report_incident` | **write** | **SPENDS FUNDS and submits a transaction.** Staked `IncidentRegistry.reportIncident` from `MONAD_PRIVATE_KEY`. Defaults to `dry_run=true`; pass `dry_run=false` to actually send. |

`claimless_report_incident` is the only destructive tool. It sends a real transaction and locks a **MON** stake that can be lost if a challenge disproves the report. Its description carries a prominent warning, it defaults to a dry run that validates and quotes the plan without sending anything, and it fails with a clear message when `MONAD_PRIVATE_KEY` is not configured.

## Install

```sh
npm install @claimless/sdk zod
# plus your runtime:
npm install @langchain/core langchain   # LangChain path
npm install ai                          # Vercel AI SDK path
```

Inside this monorepo the package references `@claimless/sdk` via a relative file dependency (`file:../../sdk`), so no republish is needed.

## LangChain usage (copy-paste)

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { claimlessLangChainTools } from "@claimless/langchain-tools/langchain";

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4o" }),
  tools: claimlessLangChainTools(), // all four; use claimlessReadTools() to omit the write tool
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What is the risk score of ERC-8004 agent 10182?" }],
});
```

Tool outputs are JSON strings. Failures (bad input, reverts, missing signer) are returned as `{"error": "..."}` instead of throwing, so the agent can recover.

## Vercel AI SDK usage (copy-paste)

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { claimlessVercelTools } from "@claimless/langchain-tools/vercel";

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: claimlessVercelTools(), // or claimlessVercelReadTools() to omit the write tool
  prompt: "List the on-chain incidents for ERC-8004 agent 10182 on Monad testnet.",
});
```

Tool results are plain objects; the AI SDK serialises them into tool-result parts automatically.

## Filing an incident (write tool)

```ts
import { runReportIncident } from "@claimless/langchain-tools";

// 1. Dry run (default): validates inputs and quotes the would-be tx. Nothing is sent.
const plan = await runReportIncident({
  agentId: "10182",
  kind: "SLA_BREACH",
  severity: 3,
  evidence: { taskId: "t-123", observed: "timeout after 30s" },
  dryRun: true,
});
console.log(plan.stakeWei, plan.kindHash, plan.evidenceHash);

// 2. Real submission: needs MONAD_PRIVATE_KEY funded with MON (stake + gas). SPENDS FUNDS.
const receipt = await runReportIncident({ ...plan, dryRun: false });
console.log(receipt.txHash, receipt.explorer);
```

## Configuration

| Env var | Required | Default |
|---|---|---|
| (none) | no | Read tools work with zero configuration. |
| `MONAD_RPC_URL` | no | `https://testnet-rpc.monad.xyz` |
| `MONAD_PRIVATE_KEY` | only for `claimless_report_incident` with `dry_run=false` | absent - write path fails with a clear message |

Addresses come from the SDK config, which mirrors `contracts/deployments/monad-testnet.json`:

| Contract | Address |
|---|---|
| IncidentRegistry | `0xf6B7b759EDcc25AC2D8e941ccbA0A03E401a771D` |
| RiskScore | `0xC839223ca14BFbe1DA4bC72e885eCe18caCed690` |
| AgentIdentity (ERC-8004 adapter) | `0x4871Cf94B11A5804F63629A21DFF133C6958eDfa` |
| ERC-8004 IdentityRegistry (canonical) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 ReputationRegistry (canonical) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Build and test

```sh
cd integrations/langchain
npm install
npm run build
npm test        # vitest: live RPC reads against Monad testnet + no-signer write rejection
```

Tests hit the **live** Monad testnet RPC (no mocks): agent 10182 must return its accepted incident and score 87, agent 1867 must return score 100, and the write tool must reject with a clear signer error when no key is configured.