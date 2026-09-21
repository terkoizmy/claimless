# Claimless — Recorded Demo Script (target 2:30)

> Week 3 gate deliverable. Shot list for the 2-3 minute video (PLAN.md §4 scenario).
> Every command below is verified to work today. Every on-screen value is sourced
> from the contracts, the seed script (`sdk/scripts/seed-demo.ts`), or the
> dashboard (`web/app/page.tsx`). Nothing here is invented; anything not yet
> observable is marked **UNVERIFIED — confirm on record day**.

---

## 0. The one line the video must land

> **Payout with no claim, no vote, no human.** An agent reports an incident, a
> public score emerges, coverage is priced from it, and the pool pays the moment
> a measurable condition is met. The committee that killed Nexus Mutual, InsurAce
> and Cover Protocol is simply absent here.

---

## 1. Demo state (what must be true before recording)

Restored by `cd sdk && npm run seed:demo` (idempotent, guarded by on-chain
preconditions). The three-way cast:

| Agent | State on chain | What it proves on screen |
|---|---|---|
| **10182** | 1 accepted `SLA_BREACH` incident, severity 4 → score **87** → normal terms (**1.5x**, cap **0.4 MON**); policy bought; trigger **ARMED** and unfired | A disclosed record, priced normally, and the live payout moment |
| **1867** | Clean (score **100**), canonical ERC-8004 identity, published Claimless summary | A clean agent with a *portable* ERC-8004 reputation summary |
| **77001** | 1 incident **PENDING** (severity 5, challenge window open) → priced **SILENT** | Pending is not a record |

The armed trigger is the point: the payout condition is already true
(`checkCondition` → `met=true`, score 87 ≤ threshold, accepted 1), but nothing
has fired. The live moment of the video is calling `evaluate(policyId)` on stage.

## 2. What a viewer will see (the numbers, and where they come from)

| On-screen value | Where it comes from |
|---|---|
| Score **87** for 10182 | `RiskScore` formula on the card: `100 − accepted·5 − severitySum·2` → 100 − 1×5 − 4×2 = 87 |
| **1.5x** multiplier (10182) | `CoverPool.multiplierForScore(87)` → 15_000 (score band 80-89) |
| **5x** multiplier (silent agents) | `CoverPool.NO_RECORD_MULTIPLIER` = 50_000 |
| Max coverage **0.4 MON** (record) vs **0.04 MON** (silent) | Normal cap is 20% of capacity (`NORMAL_MAX_CAPACITY_BPS` 2000); silent agents are hard-capped to 10% of normal (`NO_RECORD_MAX_BPS` 1000) |
| Policy amount **0.04 MON**, 30 days | The seed's `COVER_AMOUNT` / `COVER_DURATION` bought via `buyCover` |
| Payout **0.04 MON** to the buyer | `ParametricTrigger.evaluate` → `CoverPool.executePayout` |
| On-chain reason string | `"score 87 <= <threshold> with 1 accepted incident(s)"` (threshold as registered; the seed uses 90) |

**Record-day check:** if the pool capital differs from record day to record day,
the two cap numbers scale with it. Read aloud whatever the screen shows; the
*relationship* (silent cap = 10% of normal) is the constant.

## 3. Live-chain vs read-only (per shot)

| Shot | Chain access |
|---|---|
| 1 Dashboard | **Read-only** (live RPC reads, no writes) |
| 2 Passkey | **Off-chain** (local crypto; no transaction) |
| 3 Agent reports | **LIVE WRITE** (staked `reportIncident`) |
| 4 Score drop | **Read-only** (contract + Envio indexer agreement) |
| 5 Coverage / pool | **Read-only** (existing live policy, restored by the seed) |
| 6 Condition check | **Read-only** (pure view) |
| 7 Payout | **LIVE WRITE** — the money moment |
| 8 Close / MCP | **Read-only** (live stdio reads) |

## 4. Pre-record checklist (run top to bottom, in order)

- [ ] **Indexer up:** `cd indexer && docker compose up -d` — GraphQL at `http://localhost:8081/v1/graphql`. Verify check 1-2 need it.
- [ ] **Seed the demo state:** `cd sdk && npm run seed:demo` — expect `checkCondition: met=true ... fired=false` and `policy <id> is ARMED`. Note the printed **policyId**; it is the argument for shots 6-7.
- [ ] **SDK gate:** `cd sdk && npm run verify` — expect **5 passed, 0 failed** (contract score = indexer score = 87 path, registry counts, ERC-8004 summary readable, Aurora dry quote returned).
- [ ] **Web build:** `cd web && npm run build` (static export into `out/` must succeed), then `npm run dev` → `http://localhost:3000`.
- [ ] **Terminal:** font large enough for 1080p (≥16pt equivalent), dark theme, clear scrollback (`cls` in cmd.exe before each shot).
- [ ] **Explorer tabs pre-opened** at `https://testnet.monadvision.com/address/...` for IncidentRegistry `0xf6B7b759EDcc25AC2D8e941ccbA0A03E401a771D`, RiskScore `0xC839223ca14BFbe1DA4bC72e885eCe18caCed690`, CoverPool `0xA7CDb9c01A329c179da20beE22110082B3CaC0Ae`, ParametricTrigger `0x12B582FFF71f93dDbfb673189c3C206E9A1c1204`, and the canonical ERC-8004 Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`.
- [ ] **Wallet env:** `.env` has `MONAD_PRIVATE_KEY` (seed + evaluate) and the Privy vars (`PRIVY_APP_ID` / `PRIVY_APP_SECRET`) if you want the reporter's banner to say `privy`. Without them the banner honestly says it used the local-key fallback; decide which story you are telling and keep it consistent.
- [ ] **Foundry on PATH:** `cast` resolves (Foundry 1.8.3 at `%USERPROFILE%\.foundry\bin`).
- [ ] **Armed, not fired:** confirm the seed's last line shows `fired=false` for the armed policy. If a take misfires, re-run the seed: after a fired policy it buys a **fresh** policy and re-arms it automatically.
- [ ] **Mera decision:** the real browser passkey ceremony (Google Password Manager, sync ON) is a human step that is **still UNVERIFIED**. Record shot 2 from the Node path (`mera:demo` + 8 passing tests) unless the ceremony has been completed before recording day.

## 5. Shot list (8 steps, numbered as in PLAN.md §4)

### Shot 1 — The dashboard (0:00-0:32) · READ-ONLY

**Action:** open `http://localhost:3000` (after `cd web && npm run dev`).

**On screen:** header `AGENTS · LIVE READ`; loading line `reading IncidentRegistry · RiskScore · CoverPool on chain 10143…`; then two agent cards:

- `agent #10182` with badges **RECORD** and **CRE WATCHED**: risk score **87/100**, formula line `100 − accepted·5 − severitySum·2`, accepted incidents **1** (`1 reported · severity sum 4`), premium multiplier **1.5x**, max coverage **0.4 MON** (`normal cap`), quote row for 1.000 MON / 30 days, incident row `SLA_BREACH · severity 4 (SEVERE) · status ACCEPTED · stake 0.01 MON`.
- `agent #1867` with badge **SILENT** and `ERC-8004 ✓ owner 0xF601…`: risk score **100/100**, multiplier **5x**, max coverage **0.04 MON** (`hard-capped 10% of normal`), green counterfactual box: `disclose the same record at score 100 and the pool prices you at 1x (vs 5x now) with a cap of 0.4 MON (vs 0.04 MON now). Silence costs 5x premium and 90% of your coverage.`

**Narration (one paragraph):** "This is Claimless: a live dashboard over five contracts on Monad testnet, chain 10143. Every number is a real read from the chain, nothing mocked. Agent 10182 has one accepted, staked incident on record, so it is scored 87 and priced at the normal 1.5x tier. Agent 1867 has never disclosed anything. Same protocol, same pool: it is quoted a 5x premium and its coverage is hard-capped to a tenth of 10182's. We don't punish silence and we don't pay for honesty. We price the silence."

### Shot 2 — The underwriter's key is a passkey (0:32-0:52) · OFF-CHAIN

**Action:** in a terminal, `cd sdk && npm run mera:demo`, then `npm test` (expect `8 passed, 0 failed`).

**On screen:** the demo derives **five distinct EOAs from one 32-byte PRF input**, reproducibly (labelled STUB PRF; `isMeraAvailable()` is `false` under Node by design, because PRF is computed inside the authenticator and cannot be polyfilled). The test run prints the eight `deriveManyKeys` checks: same PRF → same addresses, N indexes → N distinct addresses, wrong-length PRF rejected, EVM-format checks, purpose-label convention, bounds enforced.

**Narration:** "The underwriter is a human, so the human account layer is Mera: no seed phrase, no browser extension, no API key, no server, no custody. One passkey, and the PRF output that only a real authenticator can produce derives many independent keys from it. Eight determinism tests pin the derivation; the same PRF always yields the same addresses. *(If the live browser ceremony has been completed by record day, swap this shot for the real Chrome passkey sign-in and say so. It is currently UNVERIFIED — do not fake it.)*"

### Shot 3 — An agent reports, no human (0:52-1:15) · **LIVE WRITE**

**Action:** `cd sdk && npm run report` (defaults: agent 10182, `SLA_BREACH`, severity 4, stake = `minStake` 0.01 MON).

**On screen:** `signer` banner naming the wallet kind it resolved (`privy ... keys in a TEE, ephemeral signing` when configured, otherwise the honest local-key fallback line); chain guards (chain 10143, IncidentRegistry has code, `minStake=0.01 MON, CHALLENGE_WINDOW=3 days`); the evidence commitment (`evidenceHash=0x…`, payload stays off-chain); `submitted: 0x…`; `mined in block …`; `incident id=… status=PENDING`; the challenge deadline; the explorer link.

**Narration:** "Now the agent side. A Privy agent wallet signs this transaction: keys live in a TEE, the process only ever holds an ephemeral signing key, and no human touches anything. The agent observed an SLA breach, committed the evidence as a hash, and posted a 0.01 MON stake. That stake is a bond: a challenger can match it within the 3-day window, and the dispute winner takes both bonds. The report lands as PENDING."

**Honesty beat (say it, it is the point):** "Watch the dashboard: the score did not move. Pending is not a record. It only counts once it survives the challenge window, and that is deliberate."

*(Repeatability note: this shot adds one PENDING incident for 10182. It does not change the score or the pricing, because only accepted incidents feed the score. For a clean take, re-run the seed before the next recording pass; for a no-write rehearsal, `DRY_RUN=1 npm run report` prints the plan and sends nothing.)*

### Shot 4 — The score is real, and two independent paths agree (1:15-1:30) · READ-ONLY

**Action:** back on `http://localhost:3000`, press `refresh reads`; then `cd sdk && npm run verify` and show the top block.

**On screen:** the verify output: `contract: score=87 accepted=1 severitySum=4` and, with the indexer running, `indexer: score=87 accepted=1 severitySum=4`, followed by `[PASS] score agrees across paths`. (The Envio indexer is a separate process serving GraphQL at `http://localhost:8081/v1/graphql`; it saw the incident lifecycle in realtime when it was accepted: `IncidentReported` → `IncidentChallenged` → `ChallengeResolved` → `IncidentFinalized` → `ScoreUpdated`.)

**Narration:** "The score is not a database row we drew. It is computed on-chain from accepted, staked incidents: 100 minus 5 per incident minus 2 per severity point. 100 minus 5 minus 8: 87. And it is not read one way. The contract says 87, and Envio's indexer, watching the same events through a second independent pipeline, says 87. The verify script checks five things like this and prints five PASSes."

### Shot 5 — Underwriter buys coverage for that agent (1:30-1:45) · READ-ONLY (existing live policy)

**Action:** open `http://localhost:3000/coverage/` — pool capital, locked capital, premiums, the live policy for 10182 (0.04 MON, 30 days, active), the registered trigger, and the CRE forwarder line. If you want to record the *purchase* itself, that is the seed's `buyCover` step: after a policy has fired, re-running `npm run seed:demo` prints `quote: premium=… cap=0.4 hadRecord=true mult=1.5x` and `bought policy …` before re-arming. **UNVERIFIED on camera:** the exact premium number depends on pool state at record time; read the screen, do not script it.

**Narration:** "The underwriter, holding that passkey, buys 30 days of coverage on agent 10182: 0.04 MON of cover, premium priced entirely by arithmetic. The premium formula is amount times duration times base rate times a risk multiplier, and the multiplier is a pure function of the score. Quote it again and you get the same number. There is no discretion anywhere in this contract to override one."

### Shot 6 — The condition, measured (1:45-1:55) · READ-ONLY

**Action:** `cast call 0x12B582FFF71f93dDbfb673189c3C206E9A1c1204 "checkCondition(uint256)(bool,uint256,uint256)" <policyId> --rpc-url https://testnet-rpc.monad.xyz` (policyId from the seed output).

**On screen:** the tuple `true, 87, 1` → met=true, score=87, accepted=1. The seed already printed this before recording: `checkCondition: met=true score=87 accepted=1 fired=false`, plus `policy <id> is ARMED and its condition is met`.

**Narration:** "The trigger for this policy is registered and armed. Its condition is deliberately narrow and measurable: the agent's score at or below a threshold, with at least one accepted incident on record. The score is 87, the threshold is 90. The condition holds. Nothing has fired yet. We leave it armed, because the payout should happen on camera."

### Shot 7 — The payout fires, live (1:55-2:18) · **LIVE WRITE** (the money moment)

**Action:** `cast send 0x12B582FFF71f93dDbfb673189c3C206E9A1c1204 "evaluate(uint256)" <policyId> --private-key %MONAD_PRIVATE_KEY% --rpc-url https://testnet-rpc.monad.xyz`
*(the exact command, with the current policyId, is printed by `npm run seed:demo`; in cmd.exe use `%MONAD_PRIVATE_KEY%`, in POSIX shells `$MONAD_PRIVATE_KEY`).*

**On screen:** the tx hash and block; then the explorer receipt with `TriggerEvaluated(policyId, true, 87, 1)` and **`PayoutExecuted(policyId, 10182, 40000000000000000, "score 87 <= 90 with 1 accepted incident(s)")`** — 0.04 MON moved from the pool to the buyer. *(Threshold in the reason string is whatever the trigger was registered with; the seed registers 90. Confirm on the day; do not script a different number.)*

**Narration — the beat when it fires (memorize this one):** "That's the payout. Nobody filed a claim. No vote was held. No committee convened, because there is no function for one: this contract has no claim, no vote, no approve, no dispute for the payout. `evaluate` read the score, the arithmetic said yes, and the pool paid the policyholder 0.04 MON. The reason is written on-chain so the payout is auditable without reading anything off-chain. Every insurance protocol that died, died at exactly this step. We removed the step."

*(If the take misfires because the condition no longer holds or the trigger already fired: re-run `npm run seed:demo`, which re-arms a fresh policy. Never splice a different take's payout into this shot.)*

**Design note worth one sentence if time allows:** the same payout can be driven by Chainlink CRE: the workflow reads the same score on a Decentralized Oracle Network and delivers a signed report through the KeystoneForwarder (`0xF8344CFd5c43616a4366C34E3EEE75af79a74482`), and the trigger contract re-derives the condition from on-chain state before paying, so a compromised report cannot mint a payout that is not owed. The staging workflow config (`cre/claimless-trigger/config.staging.json`) watches agent 10182 on Monad testnet.

### Optional insert — "Deposit from any chain" (Aurora Intents) · READ-ONLY

**Action:** `cd sdk && npm run verify` and show the last block: `4) Aurora Intents dry quote (no funds, no API key)` → `[PASS] live dry quote returned` with `amountOut=… usd=… timeEstimate=…s`. (The script posts to `https://1click.chaindefuser.com/v0/quote` with `dry: true`, 0.50 USDC from Base, destination Monad USDC.)

**Narration (one sentence, say the caveat once):** "Capital can reach this pool from any of ~35 chains through Aurora Intents; that leg is a live quote on mainnet assets because Aurora Intents has no testnet at all, while everything else you have seen runs fully on Monad testnet."

### Shot 8 — Close: no adjudication, and anyone can read it (2:18-2:30) · READ-ONLY

**Action:** back on `/coverage/` (trigger status, CRE forwarder), then one quick terminal beat: `cd mcp && npm run smoke` (live stdio MCP session; lists the 4 tools and calls all of them with real chain reads).

**Narration:** "Everything you just saw was contracts, a passkey, an agent wallet, an indexer, an oracle network, and a cross-chain quote. No dashboard privilege, no admin key, no human anywhere in the payout path. And the whole risk layer is one line away for any agent: an MCP server exposes identity, risk, incidents, and staked reporting, plus an `mm` plugin for MetaMask Agent Wallet. Identity lives in the canonical ERC-8004 registries, where Claimless is one of the only layers actually publishing reputation. Coverage without claims: payout triggered by evidence, not human judgment."

**Optional third beat if time allows** (drop first if over 2:30): `mm claimless risk 10182` through the MetaMask Agent Wallet plugin. **Honesty note:** the plugin is built and its 24 unit tests pass, but it has **not** been run end-to-end (`mm` CLI not installed). Do not show it as a live command unless you have run it. Default to cutting it.

## 6. Timing budget (total 2:30)

| Shot | Window | Length |
|---|---|---|
| Hook (name + one-liner over dashboard) | 0:00-0:12 | 12s |
| 1 Dashboard | 0:12-0:32 | 20s |
| 2 Passkey | 0:32-0:52 | 20s |
| 3 Agent reports (live tx) | 0:52-1:15 | 23s |
| 4 Score + verify | 1:15-1:30 | 15s |
| 5 Coverage | 1:30-1:45 | 15s |
| 6 Condition | 1:45-1:55 | 10s |
| 7 Payout fires (live tx) | 1:55-2:18 | 23s |
| 8 Close | 2:18-2:30 | 12s |

If the recording runs long, cut in this order: shot 8's MCP beat → shot 2's second command → shot 5's seed-purchase variant. Never cut shot 7's payout beat or shot 3's "pending is not a record" line; they carry the thesis.

## 7. Facts this script deliberately does NOT claim

- The exact premium number in the 1-MON dashboard quote row (pool-state dependent; read it aloud on the day).
- The policyId and the exact threshold in the trigger's reason string (read them from the seed output and the tx at record time).
- A live Mera browser passkey ceremony (needs a human in desktop Chrome with the passkey in Google Password Manager; currently UNVERIFIED).
- A live `mm claimless …` run (the `mm` CLI is not installed; 24 unit tests pass, end-to-end does not).
- A live CRE `onReport` delivery (the permissionless `evaluate` path is the on-camera payout; CRE is presented as the second, DON-signed path).
- Any Aurora Intents funds movement (the Aurora leg is a `dry: true` quote; if you add it to the video, show it inside the verify output's `[PASS] live dry quote returned` line and state once: "Aurora Intents has no testnet, so this leg is a live quote on mainnet assets. Every other part runs fully on Monad testnet."). 
