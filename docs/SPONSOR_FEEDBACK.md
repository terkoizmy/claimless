# Claimless — Sponsor Integration Feedback

> Required "integration experience" write-up. One section per sponsor. Written 2026-09-21.
> Every claim is sourced from repo docs (`docs/sponsor-notes.md`, `docs/VERIFICATION.md`,
> `docs/AURORA_INTENTS_IMPLEMENTATION.md` §12-15), live command outputs recorded there, or code
> read directly. Where something is **not** verified, it says so plainly — that is the point.
>
> Address note: `contracts/deployments/monad-testnet.json` is the single source of truth for the
> current (post-Sep-21 redeploy) contract set used below. `docs/DEPLOYMENT.md` records the earlier
> Sep-16 set (`IncidentRegistry 0xF856…`, `RiskScore 0xF61B…`, `AgentIdentity 0x7eFC…`); tx hashes
> cited from that document were sent to those addresses. Canonical ERC-8004 registries are
> unchanged across both deploys.

## Summary

| Sponsor | Bounty | Status | Strongest single piece of evidence |
|---|---|---|---|
| Privy ($5,000) | ✅ DONE | live-verified end-to-end | Signature created via wallet RPC and recovered to the wallet address with `verifyMessage` |
| Nansen ($5,000) | ✅ DONE | live call verified | HTTP 200 from `smart-money/netflow` + correct credit accounting (1 credit, cache hit on repeat) |
| Chainlink CRE ($3,000) | ✅ DONE | workflow simulated live | `cre workflow simulate` on the canonical deployment: `agent=10182 score=87 accepted=1`, matching on-chain `RiskScore` exactly |
| Envio ($1,000) | ✅ DONE | indexer running live | Full event lifecycle indexed end-to-end; score 87 via GraphQL matches the contract |
| Mera (2 × $2,500) | 🟡 PARTIAL | code-complete, node-verified | 8/8 derivation tests pass; real passkey ceremony still needs a human in Chrome |
| Aurora Intents ($5,000) | ✅ DONE | live dry quote | Live `dry:true` quote returned (`amountOut=498070`, 37s estimate), no key, no funds |
| MetaMask Agent Wallet ($2,500) | 🟡 BUILT | not run end-to-end | 24 unit tests pass; `mm` CLI not installed, so no live plugin run |
| ERC-8004 (Track 04, not a bounty) | ✅ DONE | live writes into canonical registries | `getSummary(1867, …)` read back what `publishRiskSummary` wrote on-chain |

---

## 1. Privy — $5,000 ("Privy!" — agent wallet + policy engine)

**What we integrated.** App-owned agent wallets as the signing layer for autonomous agents:
`sdk/src/privy.ts` (status + wrapper), `sdk/src/signer.ts#createPrivySigner` (live signer), and
`agents/reporter.ts` (the agent reports an incident with zero user interaction). Verify with
`npm run privy:demo`.

**Evidence (live, 2026-09-21, real API calls):**

| Call | Endpoint | Result |
|---|---|---|
| Create agent wallet | `POST https://auth.privy.io/api/v1/wallets` | HTTP 200 |
| Read wallet | `GET https://auth.privy.io/api/v1/wallets/{id}` | HTTP 200 |
| Sign message | `POST https://api.privy.io/v1/wallets/{id}/rpc` | HTTP 200, signature returned |

Not just HTTP 200s: the demo signs through Privy's wallet RPC and then **recovers the signer from
the signature with viem's `verifyMessage`**, confirming it maps to the wallet address. Output:
`[PASS] Privy agent wallet signs, and the signature verifies — The private key never touched this
process.` (appId `cmuay01ox00790djphgz5wlmo`.)

**What worked well.**
- Keys live in a TEE; our agent process only ever holds an ephemeral signing key. "The private key never touched this process" is a verifiable statement, not marketing.
- Basic auth with `appId:appSecret` plus the `privy-app-id` header was enough — `PRIVY_AUTHORIZATION_PRIVATE_KEY` is not required for a simple app-owned wallet, and that kept the integration small.
- Free tier is genuinely free for our shape: 0-499 MAU + 50,000 signatures/month, and MAU counts only *logged-in* users, so many autonomous agent wallets do not consume MAU. That asymmetry is the reason Privy beats a consumer-wallet vendor for agent infrastructure.
- Policy engine included in the free tier; x402 + MPP built in.

**What was confusing or undocumented.**
- **Two hosts, one product.** Wallet management lives on `auth.privy.io/api/v1`, signing on
  `api.privy.io/v1`. Nothing in the quickstart makes the split obvious; we found it by reading
  endpoint paths carefully.
- When the authorization key is *actually* needed (owner/quorum setups) versus plain basic auth is
  not stated anywhere we could find.
- `signTransaction` is not wired in our integration yet. The verified path is the same RPC host
  with method `eth_signTransaction`; it is the remaining step before the agent submits
  `reportIncident` *through* the Privy wallet on-chain (today the reporter resolves Privy when
  configured and falls back to a local key otherwise, and it says so honestly in its banner).

**One concrete suggestion.** Publish a minimal "agent wallet in 3 calls" quickstart that shows the
two-host split and ends with a signature verification step (not just an HTTP 200). It would have
saved us the two-host discovery and it teaches the habit that matters: verify what the wallet
signed.

## 2. Nansen — $5,000 ("Best use of Nansen" — smart-money signal beyond raw data)

**What we integrated.** `sdk/src/nansen.ts`: `getAddressPnl`, `getSmartMoneyNetflow`, plus a
response cache and a credit ledger. The smart-money signal feeds `reporterWeight` in our risk
scoring. Verify with `npm run nansen:demo`.

**Evidence (live, 2026-09-21):**

```
POST https://api.nansen.ai/api/v1/smart-money/netflow   header: apikey: <key>
  body {"chains":["ethereum"]}  ->  HTTP 200, real netflow rows

npm run nansen:demo
  creditsSpent after 1st call: 1
  creditsSpent after 2nd call: 1     <- cache hit, no extra credit burned
  cache: 1 entries
  reporterWeight: 0.5
  ── Credit ledger ──   calls: 1  creditsSpent: 1/100 trial
```

**What worked well.**
- Clean REST surface; `smart-money/netflow` returned real rows on the first authenticated call.
- Response headers `X-Nansen-Credits-Used` / `X-Nansen-Credits-Remaining` make budget discipline
  programmable — our SDK records the exact value on every live call.
- Monad is supported; free plan (100 trial credits, 10/day refill) is workable *if* you cache.

**What was confusing or undocumented.**
- The auth header is lowercase **`apikey`** — correct in the docs, but every other API in this
  project uses `Authorization`/`X-Api-Key`, so it is an easy silent failure.
- Per-endpoint credit costs are not surfaced in one place. We had to learn that
  `smart-money/netflow` costs 5, `pnl-summary` 1, and **`profiler/address/labels` costs 100 — the
  entire trial in one call**. We disabled that endpoint in code by design.
- Budget math is unforgiving: 10 credits/day = 2 smart-money calls/day free. Without our cache
  layer the day's budget is gone by noon.

**Bug we found (and what it says about the API's input validation):** a hardcoded demo address
(`0xd8dA6BF26964aF9D7eD9eC36A1bCB34A0E3F4b2`) was 41 characters, not 42, and the API rejected it as
invalid. We replaced it with the ENS-resolved `vitalik.eth` address
(`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`), checked at 42 characters. Address literals are now
a known failure mode in our repo (this was the second truncation bug of the same shape).

**One concrete suggestion.** Add a "credit price" field to each endpoint's OpenAPI schema (or a
`/credits` endpoint), and have trial-tier keys receive a warning (or a soft block) on endpoints that
cost more than the daily refill. One accidental `profiler/address/labels` call should not end a
developer's evaluation.

## 3. Chainlink CRE — $3,000 ("Best workflow with CRE" — trigger orchestration)

**What we integrated.** CRE as the trigger orchestration layer: workflow in
`cre/claimless-trigger/` reads `RiskScore.getScore` / `getAcceptedCount` for the watched agent and
delivers a DON-signed report to `ParametricTrigger.onReport` through the KeystoneForwarder. Config
(`config.staging.json`): agentId 10182, scoreThreshold 80, minAcceptedIncidents 1, chain
`monad-testnet`.

**Evidence:**
- Forwarder on Monad testnet: `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (chainSelector
  `2183018362218727504`), recorded in `contracts/deployments/monad-testnet.json` and consumed by
  the trigger's constructor.
- **Live simulation (2026-09-21, canonical deployment):** `cre workflow simulate claimless-trigger
  --target staging-settings --trigger-index 0 --non-interactive` compiled, ran the cron trigger,
  and read the real chain:
  `[USER LOG] [claimless] agent=10182 score=87 accepted=1 breach=false` →
  `{ breach: false, decision: "OK: score 87 > 80; no payout", score: 87 }`.
  The value matches `RiskScore.getScore(10182)` on chain exactly.
- **Live-chain encoding check (2026-09-16):** `cast sig` gives `0x0e1af57b` for
  `getScore(uint256)` and `0xa437d4f7` for `getAcceptedCount(uint256)`; a raw `eth_call` with that
  calldata returned **87** and **1** against real state. The workflow's hand-rolled ABI encoding is
  correct against the live chain.
- Contract side: `ParametricTrigger` implements `IReceiver.onReport(bytes,bytes)` and accepts
  reports **only** from the immutable forwarder address.
- CLI v1.34.0 installed; project scaffolded in `cre/claimless-trigger/` with staging and production
  configs.

**What worked well.**
- Free to build and simulate; no LINK token needed (LINK is only for classic oracle services).
- Monad testnet is properly supported (CLI ≥ 1.30.0, TS SDK ≥ 1.19.0) and the per-chain forwarder
  addresses are published — that table saved us a day.
- The security model matches ours exactly, so we designed around it: our `onReport` **re-derives
  the payout condition from on-chain state** and treats the report only as a *signal to evaluate
  now*. A compromised or buggy workflow cannot mint a payout the policy is not owed; verifying the
  forwarder is the first gate, re-checking state is the second, and the second is the one that
  matters.

**What was confusing or undocumented.**
- CLI auth is via `cre account` login, not an API key; our `CRE_API_KEY` env placeholder has no
  clear meaning (it is valid only for headless/CI use). `cre login` was done interactively.
- `cre workflow simulate` opens an interactive target picker unless you pass `--target`,
  `--trigger-index`, and `--non-interactive`. That combination is not in the quickstart and is what
  a scripted/CI run needs.
- The EVM write path (KeystoneForwarder + `IReceiver`) spans several documents; a single
  "consumer contract + workflow in 100 lines" example would compress the learning curve a lot.
- Deploy requires approval (`cre account access`) — fine, but the docs could state up front that
  simulation alone is a legitimate demo target.

**One concrete suggestion.** Ship a canonical minimal example pair (one consumer contract
implementing `IReceiver`, one workflow that writes to it) with the exact `cre` commands to
simulate it against a testnet, in the docs next to the forwarder table. The forwarder table itself
is excellent; it deserves an equally good "first report end-to-end" walkthrough.

## 4. Envio — $1,000 ("Best Use of Envio" — indexer drives a core feature)

**What we integrated.** Self-hosted Envio stack (Docker: `postgres:17.5`, `hasura/graphql-engine
v2.43.0`, `envio-indexer`) indexing Claimless events on Monad testnet, plus `sdk/src/envio.ts`
GraphQL queries for the dashboard's real-time scores. The indexer is a load-bearing dependency:
the dashboard's score column and the SDK's cross-check both read it.

**Evidence (live, 2026-09-16, full pipeline verified):**

| Step | Observed |
|---|---|
| `IncidentReported` | `agentId=10182`, `severity=4`, `txHash=0x814a6530…`, `blockNumber=62822763` |
| Challenge lifecycle | `IncidentChallenged` → `ChallengeResolved(resolved=true, reportStands=true)` → `IncidentFinalized(status=ACCEPTED)` |
| `Agent` aggregate | `incidentCount=1`, `acceptedCount=1`, `severitySum=4` |
| `ScoreUpdated` | `ScoreSnapshot` `oldScore=0 → newScore=87` |
| Cross-check | GraphQL score **87** == on-chain `RiskScore.getScore(10182)` **87** |

GraphQL endpoint: `http://localhost:8081/v1/graphql`.

**What worked well.**
- Genuinely self-hostable: the three-service Docker stack indexed real Monad testnet events
  end-to-end with no hosted dependency.
- HyperSync token works as `Authorization: Bearer <token>` against `https://10143.hypersync.xyz`,
  and both Monad mainnet 143 and testnet 10143 are supported.
- An RPC-based config variant (`config.rpc.yaml`) exists for a token-free setup.
- Why this bounty matters here: Monad's public RPC caps `eth_getLogs` at a 100-block range, which
  makes an indexer close to mandatory for any history-dependent app. Envio is not decoration in
  this repo; it is the second independent data path that must agree with the contract.

**What was confusing or undocumented (eight configuration defects, each cost real time):**
1. Wrong API version (v2 vs v3 config schema).
2. Hand-declared relation id columns.
3. Missing `<field>_id` assignment in handlers.
4. `uint8` → `Int` coercion.
5. Undeclared `event.transaction` / `block.timestamp` usage.
6. `Timestamp!` vs `BigInt!` typing.
7. Address interpolation happening at `codegen` time.
8. The `start_block` checkpoint rule.

Also load-bearing: **Envio publishes no Windows binary** (only linux/darwin targets in
`optionalDependencies`), so on a Windows machine the indexer *must* run via Docker/WSL. And the
API's error for a *missing* Authorization header reads "Your token is malformed", which says
"missing token", not "invalid token".

**One concrete suggestion.** Publish the list above as a "v3 config pitfalls" page (or add these to
a lint pass in `envio codegen`), and state the Docker-on-Windows requirement at the top of the
quickstart rather than letting developers discover it in `optionalDependencies`.

## 5. Mera (Category Labs) — 2 × $2,500 ("Best Mera-Powered UX" + "One Passkey, Many Keys")

**What we integrated.** `sdk/src/mera.ts`: passkey login for the **human** underwriter (wallet
separation: Mera for humans, Privy for agents) and `deriveManyKeys` — many independent accounts
from one passkey's PRF output. Verify with `npm run mera:demo` and `npm test`.

**Evidence (2026-09-21, node-verified):**

```
✔ deriveManyKeys: same PRF output yields the same addresses
✔ deriveManyKeys: distinct indexes yield distinct addresses
✔ deriveManyKeys: a different PRF output yields different addresses
✔ deriveManyKeys: addresses are well-formed EVM addresses
✔ deriveManyKeys: purpose labels follow the documented convention
✔ deriveManyKeys: a wrong-length PRF output is rejected
✔ deriveManyKeys: count bounds are enforced
✔ deriveManyKeys: index 0 is stable across purpose prefixes
8 passed, 0 failed
```

`mera:demo` exercises the full derivation, the viem account adapter, and ERC-191/EIP-712 signing
in Node, printing five distinct EOAs from one 32-byte PRF input, reproducible.

**What worked well.**
- Zero-config in the best sense: no API key, no server, no custody; accounts are regular EOAs;
  nothing to deploy. `MERA_ENABLED` is a feature flag, not a credential.
- "One Passkey, Many Keys" is a genuinely testable premise: determinism and distinctness are
  unit-testable properties, and ours are pinned by 8 tests.
- Honest architecture: `isMeraAvailable()` is `false` under Node **by design**, because the PRF
  output is computed inside the authenticator and cannot be polyfilled. We built around that
  instead of around a Node shim.

**What was confusing or undocumented — and the honest boundary:**
- **The real passkey ceremony is NOT yet verified.** The gate is a human in desktop Chrome
  (signed into Google, sync ON, passkey saved to **Google Password Manager**, served over HTTPS or
  localhost). What a browser proves and Node cannot: that a real ceremony returns a PRF output at
  all, that GPM stores it, and that the same address reappears on a second synced device. Until
  that 2-minute step happens, the integration is code-complete and node-verified, not live.
- The sharpest undocumented pitfall we found: on desktop Chrome, **only passkeys saved in Google
  Password Manager return PRF**. If Chrome saves to the local profile, Mera throws
  `PRF_UNAVAILABLE`. Nothing in the error path points at GPM as the cause; this is the single most
  common setup failure and it looks like a bug in your SDK when it is a browser storage decision.
- Requires HTTPS or localhost (WebAuthn secure context) — documented, but easy to hit first.

**One concrete suggestion.** Publish a one-page PRF-availability matrix (browser × OS ×
authenticator × passkey storage location) and make `PRF_UNAVAILABLE` carry the fix in its message
("save the passkey to Google Password Manager and retry"). That one error-message change would
prevent most failed integrations.

## 6. Aurora Intents — $5,000 ("Bring Any-Chain Liquidity to Monad")

**What we integrated.** Any-chain deposits into the coverage pool: `sdk/src/intents.ts`
(`getAssets`, `quoteMonadUsdcDeposit`, `getStatus`) with two surfaces — the keyless 1Click API
(`https://1click.chaindefuser.com`, default, used with `dry: true`) and the Aurora-branded API
(`https://intents-api.aurora.dev`, app key from `studio.aurora.dev`, key is not confidential).
Wired into the "Deposit from any chain" panel feeding `CoverPool.deposit()`.

**Evidence (live, 2026-09-16, zero funds):**

| Check | Result |
|---|---|
| `npm run verify` check 6 | `[PASS] live dry quote returned` — `amountOut=498070`, `timeEstimate=37s`, no API key, no funds moved |
| Route | Base USDC (`nep141:base-0x833589fc…omft.near`) → Monad USDC (`nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx`) |
| Optional live proof | planned: $0.50 USDC on **Base** (~$0.001 gas) for a real tx hash — **not yet executed** |

**What worked well.**
- The `dry: true` flow is a complete integration target by itself: quote + status tracker + asset
  discovery all work with zero key and zero funds. For a hackathon this is the right default.
- Fee economics are integrator-friendly: 60% integrator / 40% Aurora, 2 bps floor, deducted
  in-route — the fee is our revenue, not our cost, and no Aurora-chain balance is ever needed
  (it is a routing layer, not a chain we fund).
- Monad is supported as source and destination.

**What was confusing or undocumented:**
- **No testnet, and none planned** ("no testnet deployment and no plans for one"). We verified this
  four ways (FAQ, llms.txt index, registry chain IDs, DNS) and it is a *documented vendor
  limitation every submitter faces* — so we state it plainly in the demo rather than papering over
  it.
- **Testnet assets are absent from the asset registry by design**, and `originAsset` /
  `destinationAsset` must be registry IDs — so faucet USDC can never be routed through Intents, by
  anyone. There is no workaround and we did not look for one.
- Two API surfaces (Aurora-branded vs NEAR's 1Click) took reading to distinguish; we default to
  1Click because it is keyless and use the Aurora surface when an app key is configured.
- Asset IDs are NEAR-registry IDs (`nep141:…` / `nep245:…`), not token addresses — the Monad USDC
  ID had to be pulled from the registry rather than read off any docs page.

**One concrete suggestion.** Publish a canonical asset-ID table for the chains you actively
promote (Monad included) in the docs, and return a clear, dedicated error when a caller passes a
testnet contract address instead of a registry ID (today the failure is just "asset not found",
which sends everyone re-reading the registry).

## 7. MetaMask Agent Wallet Plugin — $2,500 ("Best Agent Wallet Plugin")

**What we integrated.** `mm-plugin/`: an oclif npm package adding
`mm claimless risk|agent|report|ping` to MetaMask Agent Wallet, thin wrappers over the same SDK the
rest of the project uses. Reads target Monad testnet (chain 10143, natively preconfigured); the
report command submits a staked `reportIncident` through `ctx.walletExecutor` so MetaMask policy
gates the transaction.

**Evidence — and its honest limit:**
- Code complete: `mm-plugin/src/commands/claimless/{report,risk,agent}.ts`, addresses read from
  `contracts/deployments/monad-testnet.json` with a documented fallback.
- **24 unit tests pass** (`npm test` in `mm-plugin/` — pure logic only, as the test file's header
  states): input parsing, severity bounds, evidence-hash
  normalization, kind hashing (matches the SDK convention), ABI encoding
  (`reportIncident` selector `0x6f02873e`, `getScoreBundle` selector `0x44acbfbf`), address
  fallback loading, score banding.
- **NOT run end-to-end: the `mm` CLI is not installed on this machine.** No live `mm plugins
  install` and no live `mm claimless …` call has happened. We will not claim otherwise; the honest
  boundary is exactly here.

**What worked well (from the verified sponsor facts and the template experience).**
- Monad testnet 10143 and mainnet 143 are preconfigured in Agent Wallet — no chain workaround
  needed, which is rare among sponsors in this hackathon.
- The capability model is well-designed for agents: `wallet-read` + `wallet-submit` cover our
  commands; `mnemonic-read` / `config-write` are reserved and rejected, and our plugin requests
  neither.
- The official plugin template made the package shape unambiguous (oclif-plugin keyword, `mm`
  manifest block, generated `oclif.manifest.json`, peer dep `@metamask/agent-wallet` 6.2.1).

**What was confusing or undocumented.**
- Plugins are **beta and off by default**: judges need
  `mm config set experimentalPlugins true` **and**
  `mm config set experimentalAllowUnverifiedInstalls true` before `mm plugins install` works. Two
  non-obvious flags before anything runs.
- Lifecycle scripts never run and installs fail closed on unverifiable packages — correct
  security posture, but it means plugin authors must make install side-effect-free and say so.

**One concrete suggestion.** Provide (or document) a local end-to-end path that does not require a
global install — e.g. `mm plugins install "file:<path>"` documented with the exact beta flags in
the template's README, so a plugin can be exercised in CI before publish. (The install shape
exists; a "test your plugin locally" quickstart next to it would close the loop we could not close
this week.)

## 8. ERC-8004 — Track 04 target (not a bounty; included because it is core)

**What we integrated.** We do not fork ERC-8004; we write into the canonical registries
(IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, ReputationRegistry
`0x8004B663056A597Dffe9eCcC1965A193B7388713` on Monad testnet 10143).

- `contracts/src/AgentIdentity.sol` (`0x4871Cf94B11A5804F63629A21DFF133C6958eDfa`): adapter that
  registers agents in the canonical IdentityRegistry and pushes risk summaries into the canonical
  ReputationRegistry (`tag1 = "claimless:incident"`).
- `sdk/src/erc8004.ts`: read Identity/Reputation, publish summaries; surfaced by the dashboard and
  the MCP server.

**Evidence (canonical registries, live writes, 2026-09-16):**

| Step | Tx / result |
|---|---|
| `registerAgent("ipfs://bafyclaimless-demo-agent")` | tx `0xd5cfd25d…` — agent **1867** minted in the canonical IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| `ownerOf(1867)` | the operator `0xF601a214…` — not the adapter; the NFT hand-off works |
| `publishRiskSummary` | tx `0x9d2d2493…` |
| Read-back | `getSummary(1867, [adapter], "claimless:incident", "")` → `(1, -87e18, 18)` |

(The Sep-16 txs above went through the pre-redeploy adapter `0x7eFC5354…`; the canonical
registries are the same addresses today. The current deployment's adapter is
`0x4871Cf94B11A5804F63629A21DFF133C6958eDfa`, and the dashboard/SDK read the canonical
`IdentityRegistry`/`ReputationRegistry` directly. Exact current summary value for 1867 is read
live by `npm run verify`; we do not quote a number we have not read.)

**Why this integration is the point of the project.** We measured the cold start on the live
registry: **827,827 agents registered with essentially zero feedback** (0 feedback in a
100-agent global sample; 77 entries in a 100-agent Monad sample, of which the only *real*
feedback traces to three consecutive demo token ids #10180-10182; 1,821 agents on Monad
testnet). Identity shipped
at scale; accountability did not. Claimless is the layer that populates reputation, with staked
evidence behind it.

**What worked well.**
- Deterministic addresses per network class (one testnet pair, one mainnet pair, identical on
  every chain) made the adapter network-agnostic with zero configuration.
- Identity is a plain ERC-721, so `ownerOf`/`getAgentWallet` integrate naturally; the NFT hand-off
  to the operator works exactly as specified.
- Self-feedback is blocked on-chain, which matches our design rule that no agent rates itself.

**What was confusing or undocumented (two bugs only the live registry revealed):**
1. Upstream mints with `_safeMint`, so a contract recipient **must** implement
   `IERC721Receiver` — our first `registerAgent` reverted on-chain with
   `ERC721InvalidReceiver(0x7eFC…)`.
2. **Agent ids start at 0, not 1** (`agentId = $._lastId++`), and `totalSupply()` reverts (there is
   no counter), so ids must come from `Registered` events or an indexer. Our mocks were aligned
   after the live registry told us.
3. Smaller sharp edges: `getSummary` requires non-empty `clientAddresses`; the Validation Registry
   is still under update (we do not build on it).

**One concrete suggestion.** Ship a canonical, versioned ABI + "gotchas" page (safeMint receiver
check, id origin at 0, `totalSupply()` reversion, `getSummary` client requirement) and a reference
`publishFeedback` example. Every one of the three sharp edges above cost us a live revert or a
wrong assumption; one doc page prevents all of them.

---

## Honesty table (what is proven vs not)

| Claim | Proven by | Not yet proven |
|---|---|---|
| Privy agent wallet signs | Live API + cryptographic signature recovery (2026-09-21) | `signTransaction` wired (the on-chain report-through-Privy step) |
| Nansen smart-money call | Live HTTP 200 + credit ledger (2026-09-21) | — |
| CRE workflow | Live simulation: workflow compiled and read real chain state (score 87) matching the contract | A live DON-signed `onReport` delivery (the permissionless `evaluate` path is the on-camera payout) |
| Envio indexer | Full lifecycle indexed live; GraphQL == contract (87) | — |
| Mera derivation | 8/8 determinism tests; demo derivation + signing in Node | The real browser PRF ceremony (human in Chrome) |
| Aurora Intents | Live `dry:true` quote, no key, no funds (2026-09-16) | Optional $0.50 live swap on Base |
| MetaMask plugin | 24 unit tests pass | Any live `mm` run (`mm` CLI not installed) |
| ERC-8004 writes | Live register + publish + read-back in the canonical registries (2026-09-16) | — | 
