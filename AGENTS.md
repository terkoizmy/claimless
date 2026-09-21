# Claimless — session handoff for coding

> Read this FIRST, in the order below. Everything needed is in this folder; do not re-research.

## 1. Orientation (5 minutes)

1. **`PLAN.md`** — the full 28-day execution plan, repo structure, contract specs, bounty map, and research context. Read section 0 (summary) and section 9 (research context) at minimum.
2. **`IDEA.md`** — the final idea, one-liner, tech stack, wallet architecture.
3. **`docs/AURORA_INTENTS_IMPLEMENTATION.md`** — everything about the Aurora Intents integration, including verified facts about testnet, minimums, gas, and funding. Read sections 12-15 before writing any Intents code.
4. **`docs/`** — supporting research: `BOUNTY_STRATEGY.md`, `SPONSOR_FEASIBILITY.md`, `CLAIMLESS_DEEPDIVE.md`, `WALLET_DECISION.md`.

## 2. Current state (updated 2026-09-21)

| Item | Status |
|---|---|
| Repo | `C:\Users\terkoiz\Documents\hackathon\claimless` |
| Git | Initialized, pushed to `origin/main` (`github.com/terkoizmy/claimless`) |
| Branch | `main` (push directly, no dev branch) |
| Deadline | **Oct 14, 2026, 03:59 UTC** |
| Bounty target | **$26,500** (Aurora Intents $5k, Privy $5k, Nansen $5k, MetaMask Agent Wallet Plugin $2.5k, Mera ×2 $5k, CRE $3k, Envio $1k) |
| Core components | `IncidentRegistry` · `RiskScore` · `AgentIdentity` (ERC-8004 adapter) · `CoverPool` · `ParametricTrigger` |

**All five contracts are deployed and live on Monad testnet (10143).** The canonical
addresses are in `contracts/deployments/monad-testnet.json` (single source of truth; the
SDK, CRE config, indexer env, and web dashboard all mirror it):

| Contract | Address |
|---|---|
| IncidentRegistry | `0xf6B7b759EDcc25AC2D8e941ccbA0A03E401a771D` |
| RiskScore | `0xC839223ca14BFbe1DA4bC72e885eCe18caCed690` |
| AgentIdentity | `0x4871Cf94B11A5804F63629A21DFF133C6958eDfa` |
| CoverPool | `0xA7CDb9c01A329c179da20beE22110082B3CaC0Ae` |
| ParametricTrigger | `0x12B582FFF71f93dDbfb673189c3C206E9A1c1204` |

> **Important:** the Sep 21 redeploy created this set; the pre-redeploy addresses
> (`0xF856...`, `0xF61B...`, `0x7eFC...`) are stale. Do not reintroduce them.

> **Security fix deployed (2026-09-21).** Two issues found in the previous
> deployment are fixed and live on this set:
> 1. `CoverPool.executePayout` was permissionless — anyone could drain an active
>    policy. It is now gated to the authorised `ParametricTrigger`
>    (`setTrigger`, owner-only and one-shot). Verified live: a stranger's
>    `executePayout` reverts with `NotTriggerAuthorised`.
> 2. `ParametricTrigger.registerTrigger` trusted a caller-supplied `agentId`.
>    It now requires it to equal the policy's own agent (`AgentMismatch`
>    otherwise).
>
> 96/96 contract tests pass, including both regression tests. The earlier
> deployment (and its addresses) are superseded; use the table above.

### What runs today (all verified)

| Command | Result |
|---|---|
| `cd contracts && forge test` | 93/93 pass |
| `cd sdk && npm run verify` | 5/5 pass (contract + indexer agree, ERC-8004, Aurora dry quote) |
| `cd sdk && npm run seed:demo` | idempotent demo-state seed (see below) |
| `cd mcp && npm run smoke` | live stdio session, 4 tools, real reads |
| `cd mm-plugin && npm test` | 24/24 pass |
| `cd web && npm run build` | clean; `npm run dev` serves the dashboard |
| `cd integrations/langchain && npm test` | 17/17 pass (live RPC; LangChain + Vercel wrappers) |
| `cd cre/claimless-trigger && cre workflow simulate claimless-trigger --target staging-settings --trigger-index 0 --non-interactive` | reads live chain (`agent=10182 score=87 accepted=1`) matching the contract |

### Demo state (restored by `sdk/scripts/seed-demo.ts`)

- **10182** — accepted SLA_BREACH (severity 4) → score **87** → normal terms (1.5x, 0.4 MON cap).
  Policy + trigger registered; the trigger is left **armed** so the payout can be fired live.
- **1867** — clean (score 100), canonical ERC-8004 identity, published Claimless summary.
- **77001** — PENDING incident → correctly priced **SILENT** (pending is not a record).

The indexer must be running for `verify` checks 1-2 and the dashboard:
`cd indexer && docker compose up -d`.

### Remaining before submission

| Item | Status |
|---|---|
| Demo video (2-3 min) | ❌ not recorded (Week 3 gate) — script is ready in `docs/DEMO_SCRIPT.md` |
| Mera real-passkey check | 🟡 needs ~2 min in Chrome (`mera.category.xyz/demo`) |
| MetaMask plugin end-to-end | 🟡 built + 24 unit tests; `mm` CLI not installed, no live run |
| Submission form | ❌ not filled in |

## 3. Environment status (verified 2026-09-15)

| Tool | Version | Status |
|---|---|---|
| git | 2.54.0.windows.1 | ✅ ready |
| node | v24.16.0 | ✅ ready (Envio needs v22+) |
| docker | 29.5.2 | ✅ ready (indexer stack runs) |
| **Foundry** | **1.8.3** | ✅ **installed** at `%USERPROFILE%\.foundry\bin` (added to user PATH) |

Foundry was installed from the official Windows release (`foundry_v1.8.3_win32_amd64.zip`, sha256 verified). `forge`, `cast`, `anvil`, `chisel` all work. A smoke test (`forge init` + `forge build`) compiled successfully.

Toolchain choice: **Foundry for contracts** (Solidity tests + built-in fuzzing, needed for insurance invariants), Node/TypeScript for `sdk/` and `web/`. Both are officially documented by Monad (`docs.monad.xyz/tooling-and-infra/toolkits/foundry` and `.../hardhat`).

## 4. Non-negotiable rules

- **Commit every day.** A single commit on the final day means automatic disqualification.
- **Live data, not mocks.** Every bounty requires a real integration.
- **No money spent** unless justified. Prefer free tiers. Aurora Intents demo uses `dry: true` (zero cost).
- **Do not try to testnet Aurora Intents.** It has no testnet and never will ("no plans for one"). This is verified and settled — do not re-research it.
- **Do not try to use Circle faucet USDC with Aurora.** Testnet assets are absent from the Intents registry by design. Also settled.

## 5. Confirmed free rails

| Layer | Rail | Cost |
|---|---|---|
| Contracts, pool, triggers | Monad testnet (chain 10143) | Free |
| Testnet USDC for pool flows | Circle testnet USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3` | Free via `faucet.circle.com` |
| Gas on Monad testnet | `faucet.monad.xyz` | Free |
| Aurora Intents demo | `dry: true` quote via `1click.chaindefuser.com/v0/quote` | Free, no API key |
| Optional Aurora live proof | $0.50 USDC on **Base** (not Ethereum mainnet) | ~$0.50 one-time |

## 6. First actions of a new session

1. Confirm `forge --version` works (install if not).
2. Create the folder skeleton from `PLAN.md` §1.
3. Commit the skeleton (Day 1 deliverable).
4. Move to `PLAN.md` §2 Week 1 day by day.

## 7. Working with swarm

See `PLAN.md` §11 for the full guide. Summary:

- Spawn mode is `visible` with a Windows Terminal vertical split (already configured in `~/.jcode/config.toml`). **Always pass `spawn_mode="visible"` per call** — the per-call parameter overrides the config.
- Worker model: `ollama-cloud:glm-5.3-flash` (route-pinned). Note `deepseek-v4-flash:0731-cloud` does **not** exist; the valid deepseek ids are `deepseek-v4-flash:0731` and `deepseek-v4.1-flash:cloud`.
- Always pass `label` when spawning.
- Use swarm for parallel research/verification and independent files, not for sequential coding on one file.
