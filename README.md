# claimless

Coverage without claims. On-chain risk registry for AI agents — payout triggered by evidence, not human judgment. Built on Monad.

> **Status:** all five contracts live on Monad testnet (10143); dashboard, MCP server, MetaMask plugin and CRE workflow built. See `PLAN.md` for the 28-day plan and `AGENTS.md` for the current-state handoff.

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
| `integrations/` | LangChain + Vercel AI adapters over the same SDK |
| `docs/` | Research, architecture, sponsor notes |

## Quick start

```bash
# contracts
cd contracts
forge --version      # requires Foundry 1.8.x
forge test           # 93 tests

# indexer (needed for the dashboard and `sdk verify`)
cd indexer && docker compose up -d

# sdk end-to-end verification (live chain, not mocks)
cd sdk && npm run verify        # 5/5

# restore the demo state (idempotent)
cd sdk && npm run seed:demo

# dashboard
cd web && npm run dev           # http://localhost:3000
```

```bash
# env
cp .env.example .env   # then fill in what you need
```

## Deployed contracts (Monad testnet, chain 10143)

The single source of truth is `contracts/deployments/monad-testnet.json`.

| Contract | Address |
|---|---|
| IncidentRegistry | `0xfE23A58f08bCd245ee61cb08dE1d27d2c27c5944` |
| RiskScore | `0x5cFA4968a9225fd5bCAbF88B6A35A9748E6215F4` |
| AgentIdentity | `0x6a075C7A2ebcB43F4E08FEd922AaF058437fa4dA` |
| CoverPool | `0x93634116bDDfeE1098491c839DDDfd7BaA8b7f30` |
| ParametricTrigger | `0xC5F875721E60C3198dA99Aaa639914e64fb15D12` |

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
