# claimless

Coverage without claims. On-chain risk registry for AI agents — payout triggered by evidence, not human judgment. Built on Monad.

> **Status:** early build (Week 1). See `PLAN.md` for the 28-day plan and `AGENTS.md` for the session handoff.

## Repo layout

| Path | What it is |
|---|---|
| `contracts/` | Foundry — `IncidentRegistry`, `RiskScore`, `AgentIdentity` (ERC-8004 adapter), `CoverPool`, `ParametricTrigger` |
| `indexer/` | Envio — indexes incidents and scores, serves them over GraphQL |
| `sdk/` | TypeScript SDK (sponsor integrations live here) |
| `web/` | Next.js dashboard |
| `agents/` | Autonomous agent demos (Privy wallets) |
| `mm-plugin/` | MetaMask Agent Wallet plugin |
| `mcp/` | MCP server (distribution layer) |
| `cre/` | Chainlink CRE trigger workflow |
| `docs/` | Research, architecture, sponsor notes |

## Quick start

```bash
# contracts
cd contracts
forge --version      # requires Foundry 1.8.x
forge build
forge test
```

```bash
# env
cp .env.example .env   # then fill in what you need
```

## Architecture (4 layers)

```
ERC-8004 canonical registries (identity + portable reputation)
        ▲ we publish summaries into them
IncidentRegistry  →  RiskScore  →  CoverPool / ParametricTrigger
  staked evidence      public score     parametric payout, no committee
```

## Docs

- `PLAN.md` — execution plan, contract specs, bounty map, research context
- `IDEA.md` — the idea, positioning, tech stack
- `docs/ERC8004_COLDSTART_FINDINGS.md` — why the reporting layer is the gap
- `docs/INCENTIVE_MECHANISM_DESIGN.md` — how silence gets priced
- `docs/ARCHITECTURE.md` — diagrams and flows
