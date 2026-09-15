# Sponsor Integration Notes — verified facts + signup checklist

> Created: 2026-09-16. Sources (all already researched, do NOT re-research): `PLAN.md` §5-6/§9.5, `IDEA.md`, `docs/AURORA_INTENTS_IMPLEMENTATION.md` §12-15, `docs/SPONSOR_FEASIBILITY.md`, `docs/METAMASK_AGENT_WALLET_PLUGIN.md`, `docs/ERC8004_COLDSTART_FINDINGS.md`, `docs/COLDSTART_DISTRIBUTION_STRATEGY.md`.
> Every fact is marked **VERIFIED** (confirmed in repo research, several live-tested) or **UNCERTAIN** (the human must confirm; do not assume).
> All env var names are copied verbatim from `.env.example` at repo root. Do not rename them in code.
> Default status for every sponsor: **NOT REGISTERED**. The human owner does interactive signups; the agent writes integration code (see the split table near the end).

---

## Aurora Intents — $5,000

| Field | Value |
|---|---|
| Bounty | "Bring Any-Chain Liquidity to Monad" |
| Value | $5,000 |
| Sponsor | Aurora (powered by NEAR Intents) |
| Status | **NOT REGISTERED** (optional registration) |
| Signup URL | https://studio.aurora.dev (app key is *not confidential* per Aurora docs) |

**Env vars it produces** (verbatim from `.env.example`):

| Var | Meaning |
|---|---|
| `AURORA_INTENTS_APP_KEY` | App key from studio.aurora.dev. NOT required for `dry:true` quotes. |
| `AURORA_INTENTS_BASE_URL` | `https://intents-api.aurora.dev` (Aurora's own API surface). |

**Consuming code:** `sdk/src/intents.ts` (`getAssets`, `quoteDeposit`, `getStatus`), wired into the web "Deposit from any chain" panel → `CoverPool.deposit()`.

**Facts:**

| Fact | Mark |
|---|---|
| NO testnet, ever. Verbatim: *"no testnet deployment and no plans for one"*. Do not search for one. | VERIFIED |
| Demo = `dry:true` quote via `POST https://1click.chaindefuser.com/v0/quote`; works with **no API key**, zero funds, zero gas. | VERIFIED |
| Testnet faucet USDC **cannot** be used with Aurora: testnet assets are absent from the 189-asset registry by design; `originAsset`/`destinationAsset` must be registry IDs. Settled — do not retry. | VERIFIED |
| No Aurora-chain balance is ever needed: it is a routing layer, not a chain. Only origin-chain (Base) value + gas are needed. | VERIFIED |
| Optional live proof: $0.50 USDC on **Base** (not Ethereum mainnet), ~$0.001 gas. Produces a real tx hash. | VERIFIED |
| Asset IDs: Monad USDC dest `nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx`; Base USDC origin `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`. | VERIFIED |
| Fee: 60% integrator / 40% Aurora, 2 bps floor, deducted in-route (our revenue, not a cost). | VERIFIED |
| Monad asset IDs via Aurora's `/api/tokens/{appKey}` not yet retrieved. | UNCERTAIN |
| Exact dashboard URL/path for key generation inside studio.aurora.dev. | UNCERTAIN |

---

## Privy — $5,000

| Field | Value |
|---|---|
| Bounty | "Privy!" — agent wallet (not just login) + policy engine |
| Value | $5,000 |
| Sponsor | Privy |
| Status | **NOT REGISTERED** |
| Signup URL | https://dashboard.privy.io (create app → App ID / App Secret / Authorization key). Exact console path: UNCERTAIN — confirm when signing up. |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `PRIVY_APP_ID` | App ID from the Privy dashboard |
| `PRIVY_APP_SECRET` | App secret (server-side only) |
| `PRIVY_AUTHORIZATION_PRIVATE_KEY` | Authorization signing key for server-side wallet control |

**Consuming code:** `sdk/src/privy.ts` — autonomous agent wallet (TEE-held keys, ephemeral signing key, policy engine). Used by `agents/reporter.ts` so an agent reports incidents with zero user interaction.

**Facts:**

| Fact | Mark |
|---|---|
| Free tier: 0-499 MAU + **50,000 signatures/month**. | VERIFIED |
| Agent wallets: keys live in a TEE; the agent process only ever holds an ephemeral signing key (private key never exposed). | VERIFIED |
| Policy engine (caps, allowlists) included in the free tier. | VERIFIED |
| MAU counts only **logged-in** users, so many autonomous agent wallets do NOT consume MAU. This is why Privy beats Dynamic for us. | VERIFIED |
| x402 + MPP built in. | VERIFIED |
| Monad compatible; configure via `supportedChains` / `defaultChain`. | VERIFIED |
| **Whether signup requires a credit card.** The human must check at signup (Week-1 gate; fallback in `PLAN.md` §7). | UNCERTAIN |

---

## Nansen — $5,000

| Field | Value |
|---|---|
| Bounty | "Best use of Nansen" — score enriched with smart-money data (beyond raw) |
| Value | $5,000 |
| Sponsor | Nansen |
| Status | **NOT REGISTERED** |
| Signup URL | https://nansen.ai/query → API key from the Nansen API console (docs: https://docs.nansen.ai). Exact API-console URL: UNCERTAIN — confirm at signup. |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `NANSEN_API_KEY` | API key for the free plan (100 trial credits → 10/day refill) |

**Consuming code:** `sdk/src/nansen.ts` — smart-money signal feeding `RiskScore` enrichment. **Must cache aggressively** (see credit math below).

**Facts:**

| Fact | Mark |
|---|---|
| Free plan: **100 trial credits**, then **10/day** refill; 15 req/s. | VERIFIED |
| Credit costs: `smart-money/*` = **5** credits; `profiler/address/pnl-summary` = **1**; `profiler/address/labels` = **100** (one call eats the entire trial — never call it on the free plan). | VERIFIED |
| Monad is supported. | VERIFIED |
| Free tooling: `npm i -g nansen-cli` CLI, `npx skills add nansen-ai/nansen-cli` MCP. | VERIFIED |
| Budget math: 10 credits/day refill = **2 smart-money calls/day** free — cache or the day's budget is gone by noon. | VERIFIED (derived) |
| Exact API console URL for key creation. | UNCERTAIN |

---

## Mera ×2 — $5,000 (Category Labs)

| Field | Value |
|---|---|
| Bounties | "Best Mera-Powered UX on Monad" **$2,500** + "Mera: One Passkey, Many Keys" **$2,500** |
| Value | $5,000 total |
| Sponsor | Category Labs (not Monad Foundation) |
| Status | **NOT REGISTERED** — there is no account to create; Mera is keyless |
| Signup URL | None. Test at https://mera.category.xyz/demo |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `MERA_ENABLED` | Feature flag only (`true`). No API key, no server, no custody — nothing to configure. |

**Consuming code:** `sdk/src/mera.ts` — passkey login for the **human underwriter** (wallet separation: Mera for humans, Privy for autonomous agents). For "One Passkey, Many Keys": derive many per-purpose accounts from one passkey in the same module.

**Facts:**

| Fact | Mark |
|---|---|
| Free: no API key, no server, no custody. Accounts are regular EOAs; nothing to deploy. | VERIFIED |
| **Pitfall:** on desktop Chrome, only passkeys saved in **Google Password Manager** return PRF; otherwise `PRF_UNAVAILABLE`. The most common setup failure. | VERIFIED |
| Requires HTTPS or localhost. | VERIFIED |
| "One Passkey, Many Keys" = many accounts derived from one passkey (the second bounty's premise). | VERIFIED |
| Fallback if PRF fails during the demo: mnemonic-import account (`PLAN.md` §7). | VERIFIED (plan) |

---

## Chainlink CRE — $3,000

| Field | Value |
|---|---|
| Bounty | "Best workflow with CRE" — CRE as the trigger orchestration layer |
| Value | $3,000 |
| Sponsor | Chainlink |
| Status | **NOT REGISTERED** |
| Signup URL | https://app.chain.link/cre/discover (account → install `cre` CLI) |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `CRE_API_KEY` | Placeholder for CLI/CI auth. **UNCERTAIN:** CRE CLI auth is via `cre account` login; confirm what (if anything) belongs in this var. |
| `CRE_FORWARDER_ADDRESS` | KeystoneForwarder address on Monad testnet, discovered at deploy time. |

**Consuming code:** `cre/workflow/trigger.ts` (evaluate trigger → on-chain write). The consumer contract side: `contracts/src/ParametricTrigger.sol` must implement `onReport(bytes,bytes)` (IReceiver), since the EVM write goes through **Chainlink's KeystoneForwarder**.

**Facts:**

| Fact | Mark |
|---|---|
| Free to build + **simulate**. Deploy requires approval (`cre account access`) — not needed for the demo. | VERIFIED |
| **No LINK token needed** (LINK is for classic oracle services only). | VERIFIED |
| Monad **testnet** needs CLI **v1.30.0+** and TS SDK **v1.19.0+**; Monad **mainnet** needs CLI **v1.29.0+**. | VERIFIED |
| EVM write goes through Chainlink's **KeystoneForwarder**; consumer implements `onReport(bytes,bytes)` (IReceiver). | VERIFIED |
| `--broadcast` needs testnet native tokens from `faucets.chain.link` (free). | VERIFIED |
| Demo gate is `cre workflow simulate` only — deploy is optional (`PLAN.md` §2 day 14b). | VERIFIED (plan) |

---

## Envio — $1,000

| Field | Value |
|---|---|
| Bounty | "Best Use of Envio" — indexer drives a core feature (real-time risk updates) |
| Value | $1,000 |
| Sponsor | Envio |
| Status | **TOKEN OBTAINED + INDEXER WORKING** (2026-09-16). Stack verified indexing live Monad testnet events end-to-end |
| Signup URL | https://envio.dev/app/api-tokens (free API token; only needed for HyperSync) |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `ENVIO_API_TOKEN` | Free token from envio.dev/app/api-tokens; needed for HyperSync. |
| `CONFIG_FILE` | `config.yaml` = HyperSync (needs the token); `config.rpc.yaml` = token-free RPC via `MONAD_RPC_URL`. |
| `ENVIO_PG_PORT` | `5433` on this machine (5432 is occupied by another container + a local Postgres). |
| `HASURA_EXTERNAL_PORT` | `8081` (8080 may be taken). Console at `:8081/console`. |

**Consuming code:** `sdk/src/envio.ts` (GraphQL queries for the dashboard's real-time scores) + the indexer itself in `indexer/` (`config.yaml`, `src/EventHandlers.ts`, `docker-compose.yaml`) where HyperSync consumes the token.

**Facts:**

| Fact | Mark |
|---|---|
| Free **Development** plan: soft limits 100k events / 5GB / 7-day idle. | VERIFIED |
| Self-hostable via Docker (postgres + hasura + envio-indexer; example: `enviodev/local-docker-example`). | VERIFIED |
| **Envio ships NO Windows binary** (only linux-x64, linux-x64-musl, linux-arm64, darwin-x64, darwin-arm64). On this machine the indexer MUST run via Docker/WSL. `envio codegen` and `envio start` cannot run natively. | VERIFIED (checked `optionalDependencies` of envio 2.32.12 and 3.10.0) |
| The token works as `Authorization: Bearer <token>` against `https://10143.hypersync.xyz`. A request with no Authorization header answers `Your token is malformed`, which means "missing token", not "invalid token". | VERIFIED (live request) |
| Requires **Node v22+** and **Docker** (WSL on Windows). | VERIFIED |
| Monad **mainnet 143** and **testnet 10143** both on HyperSync. | VERIFIED |
| Monad public RPC caps `eth_getLogs` at a 100-block range — a second reason the indexer matters. | VERIFIED |

---

## MetaMask Agent Wallet Plugin — $2,500

| Field | Value |
|---|---|
| Bounty | "Best Agent Wallet Plugin" |
| Value | $2,500 |
| Sponsor | MetaMask |
| Status | **NOT REGISTERED** — no sponsor signup exists |
| Signup URL | None. Needs an npm account only at publish time (https://www.npmjs.com/signup). Template: https://github.com/MetaMask/agent-wallet-plugin-template |

**Env vars it produces** (verbatim):

| Var | Meaning |
|---|---|
| `METAMASK_PLUGIN_CHAIN_ID` | `10143` (Monad testnet — natively supported). |

**Consuming code:** `mm-plugin/src/commands/claimless/report.ts`, `risk.ts`, `agent.ts` — thin oclif wrappers over `sdk/src/registry.ts`, `sdk/src/risk.ts`, `sdk/src/erc8004.ts`.

**Facts:**

| Fact | Mark |
|---|---|
| An oclif npm package adding `mm` commands; needs `oclif-plugin` keyword, `@metamask/agent-wallet` **peer** dep (latest 6.2.1), `oclif` block, generated `oclif.manifest.json`, and an `mm` manifest block. | VERIFIED |
| Monad testnet **10143** natively supported (mainnet 143 too). No workaround needed. | VERIFIED |
| Plugins are **BETA and off by default**: judges need `mm config set experimentalPlugins true` + `mm config set experimentalAllowUnverifiedInstalls true`. | VERIFIED |
| Capabilities needed: `wallet-read` + `wallet-submit`. `mnemonic-read`/`config-write` are reserved and rejected. | VERIFIED |
| Cost **$0**. Lifecycle scripts (`postinstall`) never run; install fails closed on unverifiable packages. | VERIFIED |
| Detailed judging criteria beyond the one-line wording. | UNCERTAIN |

---

## ERC-8004 — not a bounty (Track 04 target)

| Field | Value |
|---|---|
| Status | **No signup exists** — public on-chain registries. Verify via https://8004scan.io |
| Role | Track 04 target: "Agent identity and reputation under ERC-8004". **We write into the canonical registries — never fork.** |

**Canonical addresses on Monad testnet (10143)** — already in `.env.example`:

| Registry | Address | Env var |
|---|---|---|
| Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `ERC8004_IDENTITY_TESTNET` |
| Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `ERC8004_REPUTATION_TESTNET` |

(Mainnet pair `0x8004A169…` / `0x8004BAa1…` lives in `ERC8004_IDENTITY_MAINNET` / `ERC8004_REPUTATION_MAINNET`.)

**Consuming code:** `contracts/src/AgentIdentity.sol` (adapter: register + `publishRiskSummary` → `giveFeedback`) and `sdk/src/erc8004.ts` (read Identity, publish Reputation summaries).

**Facts (all VERIFIED):**

- **827,827 agents registered, essentially zero feedback** (1,821 on Monad testnet; the only real feedback is 3 consecutive demo token IDs). This is the cold-start evidence Claimless exists to fix.
- Deterministic addresses per network class: one testnet pair, one mainnet pair, identical on every chain.
- Identity is an ERC-721 (`agentId` = token ID); `getSummary` requires non-empty `clientAddresses`; self-feedback is blocked on-chain; `totalSupply()` reverts (use the 8004scan API or Envio instead of on-chain counting).
- The Validation Registry is still under update — do not build on it.
- License CC0; no cost, no key, no registration.

---

## Signup checklist (dependency order)

Human does these top to bottom. Each item names the env vars it fills in `.env.example`.

- [ ] **0. Prereqs (no sponsor):** confirm `forge --version`; Node v22+ (have v24.16.0); Docker running; claim gas at https://faucet.monad.xyz and testnet USDC at https://faucet.circle.com (fills `MONAD_RPC_URL`, `MONAD_PRIVATE_KEY`, `MONAD_TESTNET_USDC`).
- [ ] **1. Privy** — sign up at https://dashboard.privy.io, create app, enable agent wallets. **First check: does it demand a credit card?** (Week-1 gate.) Produces `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_PRIVATE_KEY`.
- [x] **2. Envio** — DONE 2026-09-16. Token obtained, self-hosted Docker stack indexing live Monad events, GraphQL verified. See `indexer/README.md`.
- [ ] **3. Nansen** — account + API key via https://nansen.ai/query. Produces `NANSEN_API_KEY`. Do **not** burn credits on `profiler/address/labels` (100 credits).
- [ ] **4. Chainlink CRE** — account at https://app.chain.link/cre/discover, install CLI **v1.30.0+**, `cre account` login. Deploy approval (`cre account access`) can wait — simulate is free.
- [ ] **5. Mera** — no account. Test a passkey at https://mera.category.xyz/demo on **desktop Chrome with the passkey saved in Google Password Manager**. Gate: PRF must return (else `PRF_UNAVAILABLE`).
- [ ] **6. Aurora Intents (optional)** — register at https://studio.aurora.dev for `AURORA_INTENTS_APP_KEY`. Dry quotes need no key; defer until `sdk/src/intents.ts` exists.
- [ ] **7. MetaMask plugin** — no signup. Create the npm account only before publish (Week 3).
- [ ] **8. ERC-8004** — no signup. Before writing the adapter, re-verify the two testnet addresses return code via `MONAD_RPC_URL`.

---

## Human vs agent split

| Human (interactive, cannot be automated) | Agent (code, no signup needed) |
|---|---|
| Privy signup + **card check** + copy App ID/secret/authorization key | `sdk/src/privy.ts` (TEE agent wallet + policy engine) |
| Envio account + API token | `indexer/` config + Docker compose, `sdk/src/envio.ts` |
| Nansen account + API key + which endpoints to budget | `sdk/src/nansen.ts` + aggressive caching layer |
| CRE account, CLI install, `cre account` login, optional deploy approval | `cre/workflow/trigger.ts`, IReceiver wiring in `ParametricTrigger.sol` |
| Mera passkey test (device-bound, needs the human's browser + GPM) | `sdk/src/mera.ts` (PRF handling + many-keys derivation) |
| Aurora studio registration (optional) + the optional $0.50 Base USDC live proof | `sdk/src/intents.ts` (`dry:true` quote + status tracker) |
| npm account + `npm publish` (2FA, interactive) | whole `mm-plugin/` package + manifest |
| Faucet claims (Monad gas, Circle USDC) if captchas appear | on-chain startup bytecode checks, tests, SDK, ERC-8004 adapter |
| Final submission form (Day 26) | demo wiring, docs drafts |

---

## Env var cross-check (vs `.env.example`)

| Sponsor | Env vars | Consumer |
|---|---|---|
| Aurora Intents | `AURORA_INTENTS_APP_KEY`, `AURORA_INTENTS_BASE_URL` | `sdk/src/intents.ts` |
| Privy | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_PRIVATE_KEY` | `sdk/src/privy.ts` |
| Nansen | `NANSEN_API_KEY` | `sdk/src/nansen.ts` |
| Mera | `MERA_ENABLED` | `sdk/src/mera.ts` |
| Chainlink CRE | `CRE_API_KEY`, `CRE_FORWARDER_ADDRESS` | `cre/workflow/trigger.ts` |
| Envio | `ENVIO_API_TOKEN`, `CONFIG_FILE`, `ENVIO_PG_PORT`, `HASURA_EXTERNAL_PORT` | `indexer/`, `sdk/src/envio.ts` |
| MetaMask plugin | `METAMASK_PLUGIN_CHAIN_ID` | `mm-plugin/src/commands/claimless/*` |
| ERC-8004 | `ERC8004_IDENTITY_TESTNET`, `ERC8004_REPUTATION_TESTNET` (+ mainnet pair) | `contracts/src/AgentIdentity.sol`, `sdk/src/erc8004.ts` |
| Monad base | `MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `MONAD_PRIVATE_KEY`, `MONAD_MAINNET_RPC_URL`, `MONAD_TESTNET_USDC` | everything |
| Deployed contracts | `INCIDENT_REGISTRY_ADDRESS`, `RISK_SCORE_ADDRESS`, `AGENT_IDENTITY_ADDRESS`, `COVER_POOL_ADDRESS`, `PARAMETRIC_TRIGGER_ADDRESS` | `sdk/*`, `cre/workflow/trigger.ts` |

**Findings:** no name mismatches. Three nuances, none requiring an `.env.example` edit:

1. The keyless dry-quote endpoint (`https://1click.chaindefuser.com/v0/quote`) has **no env var**; it will be a constant in `sdk/src/intents.ts`. `AURORA_INTENTS_BASE_URL` stays pointed at Aurora's own API (`intents-api.aurora.dev`), used only when `AURORA_INTENTS_APP_KEY` is set.
2. `MERA_ENABLED` is a feature flag, not a credential — by design, Mera needs no key.
3. `CRE_API_KEY` semantics are UNCERTAIN (CLI auth may be login-based); `CRE_FORWARDER_ADDRESS` is discovered after deploy approval.