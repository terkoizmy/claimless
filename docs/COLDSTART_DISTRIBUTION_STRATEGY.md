# Cold Start Solution: Distribution as the Fix (VERIFIED 2026-09-15)

> The question: **"who actually uses it?"** — our single biggest weakness.
> The answer: make installation into an AI agent **one line**, and ship it to the places agents actually look for tools.

## 0. The misunderstanding to correct first

An earlier draft of this document confused **distribution** with a **bounty**. They are different things:

| | Bounty (MetaMask, $2,500) | Distribution (cold-start fix) |
|---|---|---|
| Purpose | Win prize money | Get real users |
| Scope | One `mm` plugin | **Every place an agent looks for tools** |
| If we skip it | Lose $2,500 | **Product stays empty** |

The bounty is a *bonus*. Distribution is *survival*. This document is about the second one.

## 1. Why distribution is the correct fix for cold start

Our verified measurement (`ERC8004_COLDSTART_FINDINGS.md`): **827,827 agents registered, ~0 feedback.**

We identified three causes of reporting silence:

| Cause | Can distribution fix it? |
|---|---|
| Reporting is **optional** | ❌ No — needs incentive design |
| Reporting is **unpunished if skipped** | ❌ No — needs stake/slashing |
| Reporting requires **custom integration** | ✅ **Yes — this is exactly what plugins/MCP fix** |

So distribution eliminates **one of three** causes. It is necessary but not sufficient. Stating this honestly is important: a plugin alone will not populate the registry, but without a plugin nothing else matters because nobody can install the product.

**The corrected mental model:**

```
INCIDENT REPORTING = incentive (stake/reward)  ×  access (plugin/MCP)
                     ─────────────────────────    ───────────────────
                     solves "why bother"          solves "who can even do it"
```

We need both. This document covers **access**. `PLAN.md` §3 `IncidentRegistry.sol` covers **incentive**.

## 2. The distribution surface: where agents actually look

Agents find tools through a small number of channels. We should be in **all** of them.

| Channel | What it is | Effort | Reach | Verified |
|---|---|---|---|---|
| **MCP server on npm** | `npx -y @scope/claimless-mcp` | Low | Any MCP client | ✅ npm is standard |
| **Official MCP Registry** | `registry.modelcontextprotocol.io` | Low | Discovery hub | ✅ API live, HTTP 200 |
| **MetaMask Agent Wallet plugin** | `mm claimless report` | Medium | Agent Wallet users | ✅ Monad 10143 supported |
| **Nansen-style skills** | `npx skills add ...` | Low | skill-based agents | ✅ pattern exists |
| **LangChain / Vercel AI SDK tool** | Importable tool definition | Low | JS agent frameworks | ✅ standard pattern |
| **OpenAI Agents SDK / Bedrock AgentCore** | Tool definitions | Low | Enterprise agents | ✅ Privy docs list these |

**Strategic point:** MCP is the *transport*, not the product. One core SDK (`sdk/`) with several thin adapters is the right architecture — write the logic once, expose it everywhere.

```
                    sdk/  (core logic, one implementation)
                      │
   ┌──────────────┬───┴────────┬──────────────┬────────────────┐
   ▼              ▼            ▼              ▼                ▼
 MCP server   mm plugin   LangChain    Vercel AI       plain HTTP
 (npm +       (MetaMask)  tool         tool            (x402 payable)
  registry)
```

## 3. The MCP path in detail (lowest effort, widest reach)

### 3.1 How publishing works (VERIFIED from official docs)

Two steps, both free:

1. **Publish the package to npm** (the registry hosts only *metadata*, not artifacts).
2. **Register metadata** with the Official MCP Registry via the `mcp-publisher` CLI.

### 3.2 Requirements

- npm account (free)
- GitHub account (free; used for auth and namespace)
- Node.js (already have v24.16.0)
- `mcp-publisher` CLI (prebuilt binary; Windows supported)

### 3.3 The verification handshake

The registry checks the package matches its metadata. For npm this requires an **`mcpName`** field in `package.json`, and it **must match** the `name` in `server.json`:

```json
// package.json
{
  "name": "@terkoiz/claimless-mcp",
  "mcpName": "io.github.terkoiz/claimless",
  ...
}
```

**With GitHub auth, `mcpName` must start with `io.github.<username>/`.**

### 3.4 `server.json` shape

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.terkoiz/claimless",
  "description": "Read AI agent incident records and report incidents to the Claimless on-chain registry on Monad.",
  "repository": { "url": "https://github.com/terkoiz/claimless", "source": "github" },
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@terkoiz/claimless-mcp",
      "version": "0.1.0",
      "transport": { "type": "stdio" }
    }
  ]
}
```

### 3.5 Publish commands

```bash
npm publish --access public
mcp-publisher login github
mcp-publisher init          # generates server.json template
mcp-publisher publish
```

Verify:
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.terkoiz/claimless"
```

### 3.6 Known caveats (honest)

- **The MCP Registry is in preview**: *"Breaking changes or data resets may occur before general availability."* Mitigation: npm publication is the durable artifact; the registry entry is extra discovery.
- Auth mismatch produces: *"You do not have permission to publish this server"* — the namespace must match the auth method.
- Publishing to the registry requires the npm package to exist **first**.

## 4. What the MCP server should expose

Keep it small and honest. MCP tools map 1:1 to `sdk/` functions.

| MCP tool | Purpose | Reads/writes |
|---|---|---|
| `get_agent_identity` | Resolve ERC-8004 identity (owner, agentWallet) | read |
| `get_agent_risk` | Risk score + incident count for an agent | read |
| `list_incidents` | Incident history with evidence hashes | read |
| `report_incident` | Submit a staked incident report | **write (tx)** |

**Design note:** the three read tools make our dataset *useful before anyone reports* — that matters, because it means the MCP server has value on day one even with a near-empty registry. This partially decouples distribution value from cold-start data volume.

## 5. Cold start, restated honestly

Distribution solves **access**. It does not solve **volume** by itself. The honest sequence:

| Stage | Action | Effect |
|---|---|---|
| 1 | Ship MCP + plugin, publish to registries | Product becomes installable |
| 2 | Make reads genuinely useful (risk score, identity lookup) | Value exists before data exists |
| 3 | Add incentive to `report_incident` (stake or paid disclosure) | Reporting becomes rational |
| 4 | Seed with our own agent + partner agents | Registry is never empty |
| 5 | Publish summaries into ERC-8004 | Data becomes portable, discoverable elsewhere |

**Stage 3 is the hard one and remains unsolved.** Everything in stages 1-2 is achievable and is what plugins/MCP buy us. We should say this plainly rather than claim a plugin alone fixes cold start.

## 6. Cost

| Item | Cost |
|---|---|
| npm publish (public) | $0 |
| Official MCP Registry | $0 |
| `mcp-publisher` CLI | $0 |
| MetaMask plugin publish | $0 |
| **Total** | **$0** |

Fully compatible with the no-money rule.

## 7. Plan

| Step | Task | Deliverable | Gate |
|---|---|---|---|
| D1 | Build `mcp/` server wrapping `sdk/` | 4 tools work locally | `npx` runs it |
| D2 | Publish to npm with `mcpName` | Public package | `npm view` succeeds |
| D3 | Publish to Official MCP Registry | Listed server | Registry search finds it |
| D4 | Build `mm-plugin/` (MetaMask) | `mm claimless …` | Runs on Monad testnet |
| D5 | Add LangChain + Vercel AI adapters | Importable tools | Example agent uses them |
| D6 | Document install in README + demo | Install instructions | A stranger can install from README alone |
| D7 | Give feedback on each integration | `docs/sponsor-feedback.md` | Bounty requirement met |

**Minimum viable (1 day):** D1 + D2. A published npm MCP server is a real distribution win even before registry listing.

## 8. Sources

| Source | Used for |
|---|---|
| `https://registry.modelcontextprotocol.io/` | Official MCP Registry exists; API base URL (VERIFIED) |
| `https://registry.modelcontextprotocol.io/v0/servers` | API reachable, HTTP 200, returns `servers` + `metadata` (VERIFIED) |
| `https://modelcontextprotocol.io/registry/quickstart` | publish steps, `mcpName`, `server.json`, `mcp-publisher`, namespace rule, preview caveat (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/plugins/` | Agent Wallet plugin system (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/reference/supported-chains/` | Monad 10143 + 143 supported (VERIFIED) |
| `docs/ERC8004_COLDSTART_FINDINGS.md` | the measurement this document responds to |
