# Claimless — Final Idea Document

> Version: 1.0 · 2026-09-15
> Hackathon: Monad Metropolis · Deadline: **Oct 14, 2026, 03:59 UTC** · Remaining: **28 days**
> Status: **FINAL — ready to execute**

---

## 0. Name & Branding

```
Name:      Claimless
Tagline:   "Coverage without claims: payout triggered by evidence, not human judgment."
Repo:      github.com/<username>/claimless
Package:   @<username>/claimless
Contracts: IncidentRegistry · RiskScore · CoverPool · ParametricTrigger
```

**Why "Claimless":**
All our research points to one root cause behind the death of DeFi insurance: **discretionary claim adjudication**.
- InsurAce is dead (TVL $143K, staked $0)
- Cover Protocol shut down (Dec 2021)
- Nexus Mutual tried token voting (V1) → stake-weighted (V2) → gave up and moved to **3 human experts** (V3, Nov 2025)

The name **Claimless** states our core differentiator in one word: **there is no claim process, because there is nothing for a human to decide.**

**Available on npm and GitHub** (unclaimed).

---

## 1. One-liner

> **Claimless is an on-chain risk registry for AI agents plus a parametric coverage prototype: agents report incidents, a public risk score emerges, and payout is triggered automatically by measurable data — no committee, no voting, no human adjudication.**

---

## 2. Problem

AI agents fail and cause real losses, but **no loss data exists** to price insurance premiums:

| Case | Loss |
|---|---|
| Zillow Offers (2021) | $420M, business shut down |
| Air Canada chatbot (2024) | Lost in court; the "the bot is responsible for its own actions" defense was rejected |
| AI Incident Database | Hundreds of documented incidents, unstructured |

**The consequence:** Armilla AI (Lloyd's Coverholder) must verify each model **manually** — an expensive consulting service that does not scale. Nexus Mutual has no product for AI agents. **Nobody is filling the data layer.**

---

## 3. Solution

Three layers:

### Layer 1 — Incident Registry (data)
Agents/services report incidents on-chain with hash evidence: failure type, severity, input/output hash, reporter signature. Reporters post an **anti-spam stake**.

### Layer 2 — Risk Score (interpretation)
Incident data produces a **risk score per agent/service**: frequency, severity, reporter credibility. Indexed in real time by Envio.

### Layer 3 — Parametric Coverage (prototype)
An underwriter capital pool backs the risk. Payout is **triggered automatically** by measurable conditions (not subjective claims). Chainlink CRE monitors the trigger and executes.

---

## 4. Position & Differentiation

| Player | What they do | What they **do not** do |
|---|---|---|
| **x402** | Agent payment rail (75M tx/30 days) | Does not know whether the work was correct |
| **ERC-8004** | Identity/reputation/validation registries (hooks) | Provides hooks, **not validators** |
| **Nevermined** | Agent budget & mandate (fiat-first) | Does not validate work outcomes |
| **Armilla AI** | AI insurance (Lloyd's backing) | **Manual per-model** verification, does not scale |
| **Nexus Mutual** | On-chain insurance | **A 3-person committee** decides claims |

**Our position:**
> x402 lets agents pay. ERC-8004 lets agents be identified. Nevermined keeps agents within budget. **Claimless makes agent work provable — and that data is a prerequisite nobody owns.**

**Key advantage (from DeFi insurance post-mortems):**
- InsurAce is **dead** (TVL $143K, staked $0), Cover Protocol **shut down** → both caused by **discretionary adjudication**
- Nexus Mutual tried token voting (V1) → stake-weighted (V2) → gave up to **3 human experts** (V3, Nov 2025)
- **We use no voting and no committee at all.** Payout is purely parametric (the proven Sherlock Shield pattern)

---

## 5. Tech Stack (all free, verified)

| Technology | Role | Status | Why |
|---|---|---|---|
| **Monad testnet** | Chain | ✅ Free | 300ms blocks, 600ms finality, sub-cent gas |
| **Mera** | Passkey login for **humans** | ✅ Free, no API key | Mera bounty ×2 ($5k) |
| **Privy** | Wallet for **autonomous agents** | ✅ Free tier 499 MAU + 50k signatures/mo | Privy bounty ($5k) |
| **Envio** | Indexer (Docker: Postgres + Hasura) | ✅ Free, Monad verified | Envio bounty ($1k) |
| **Nansen** | Smart-money data for scoring | ✅ Free 100 credits | Nansen bounty ($5k) |
| **Chainlink CRE** | Trigger automation | ✅ Free build + simulate, Monad verified | CRE bounty ($3k) |
| **Aurora Intents** | Any-chain deposits into the Monad pool | ✅ Free demo via `dry:true`; live swap needs ~$0.50 | Aurora Intents bounty ($5k) |
| **ERC-8004** | Agent identity/reputation registries (CORE, already live on Monad) | ✅ Deployed on Monad **testnet AND mainnet**; free to use | Track 04 fit; we populate it |
| **MetaMask Agent Wallet plugin** | Distribution: `mm claimless report/risk/agent` | ✅ **Monad testnet 10143 supported natively**; $0 | Agent Wallet Plugin bounty ($2.5k) + fixes cold start |

**Total bounty target: $26,500** (excluding main track prizes)

> **ERC-8004 note:** the standard Track 04 names, and it is **already deployed on Monad testnet** (Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`) and mainnet (`0x8004A169...` / `0x8004BAa1...`). **We do not fork it — we write into it.** It has **827,827 agents registered with essentially zero feedback** (1,821 of them on Monad testnet), which is verified evidence of the cold-start problem we solve. See `docs/ERC8004_COLDSTART_FINDINGS.md`.

> **x402 on Monad** is live and the **facilitator pays gas** (`https://x402-facilitator.molandak.org`, supports mainnet 143 and testnet 10143). This makes a paid-disclosure mechanism viable with the payer spending **zero gas on testnet** — a direct answer to the cold-start incentive problem.

> **Aurora Intents caveat:** it has **no testnet** ("no testnet deployment and no plans for one"), but this does **not** block a full testnet demo. Monad testnet (10143) + Circle testnet USDC (`0x534b2f3A21130d7a60830c2Df862319e593943A3`) cover the entire app; only the Aurora hop uses a `dry: true` quote. A real swap needs cents on Base, not dollars.

### Wallet separation (important)
```
HUMAN (underwriter) ── Mera passkey (requires user presence, device-bound)
AUTONOMOUS AGENT ───── Privy agent wallet (TEE, ephemeral key, policy-scoped)
```
**They are not competitors** — Mera for humans, Privy for agents that must transact without a present user.

---

## 6. Track

**Track 04 — Trust, Identity & AI Infrastructure**

| Track phrasing | Our fit |
|---|---|
| "Protocol-level **primitives**" | Registry + trigger = primitive, not an app |
| "for **trust**" | Risk score, attestation, stake, slashing |
| "and **provenance**" | Hashed work receipt |
| "**AI** infrastructure" | Infrastructure for AI agents |
| "without any single platform capturing the value" | No single party decides a claim |

---

## 7. Business Model

**Recommendation: Option 1 + Option 3** (neither requires capital).

### Option 1 — Risk Data Subscription (Chainalysis/Nansen pattern)
| Tier | Price | Contents |
|---|---|---|
| Free | $0 | 100 queries/month, public scores |
| Pro | $99/mo | API access, historical scores |
| Enterprise | $999+/mo | Real-time feed, SLA |

### Option 3 — Assessment + Warranty (Armilla pattern)
- **$500–2,000 per agent assessment** + reliability badge
- Requires no capital (a service, not underwriting)
- Builds data credibility

### Option 2 — Coverage Fee (deferred)
Premium of 2–5% of coverage value (Nexus: 2.5–6.5% p.a.). **Requires a capital pool → deferred until there is enough data.**

**Why not a protocol fee:** x402 is free (zero protocol fee), so a "% of the rail" model is impossible.

---

## 8. Main Risks (honest)

| Risk | Level | Mitigation |
|---|---|---|
| **Cold start** (who reports?) | 🔴 High | **Solved in design:** (1) *access* — MCP + agent-wallet plugin; (2) *incentive* — **disclosure is a condition of coverage** (no record → no coverage), not a reward. Staking only for disputes. See below. |
| **Small market** (DeFi insurance category is only $122M) | 🟠 Medium-high | Sell **data**, not insurance. The risk-data market is far larger |
| **Basis risk** (trigger ≠ actual loss) | 🟠 Medium | **Narrow, deterministic** triggers: latency, HTTP status, completion rate |
| **Regulation** (selling insurance without a license) | 🔴 High | **Never call it "insurance"**. Call it a "risk registry + coverage prototype" |
| **False reports** | 🟠 Medium | Stake + staked verification + evidence hash. **No mass voting** |
| **Large players enter** | 🟠 Medium | Work **with** them (sell data), not against them |

### Cold start: now backed by hard evidence (VERIFIED 2026-09-15)

We measured the one place the problem was already attempted at scale. ERC-8004 (the Monad-endorsed agent identity/reputation standard, and an explicit Track 04 target):

| Metric | Value |
|---|---|
| Agents registered on ERC-8004 | **827,827** |
| Agents on Monad specifically | **10,170** |
| Feedback entries found | **77** in a 100-agent Monad sample (**0** in a global sample) |
| Agents verified / starred | **0** |

**Roughly 8,278 registrations per piece of feedback.** Identity shipped at scale; accountability did not. The only real feedback lives in three consecutive demo token IDs (#10180-10182).

**Why:** feedback is free, optional, and unpunished. Nobody gains by reporting and the harmed party has already moved on.

**What it means for us:** this is not a reason to abandon Claimless, it is the sharpest possible statement of the problem we solve. See `docs/ERC8004_COLDSTART_FINDINGS.md` for the full measurement, on-chain verification, and the correct integration path (write into ERC-8004's registries rather than compete with them).

### How we attack it: pricing, not paying (the resolved answer)

| Cause of silence | Fixed by | Status |
|---|---|---|
| Reporting needs **custom integration** | **MCP server on npm + Official MCP Registry, plus a MetaMask Agent Wallet plugin** | ✅ Buildable now, $0 |
| Reporting is **optional** | **Disclosure is priced into coverage** — no record means worst-tier premium and a 10% cap | ✅ Design, $0, proven pattern |
| Skipping is **unpunished** | Same mechanism: silence gets a worse price, not a fine | ✅ Design, $0 |

**The mechanism, in one line:**
> "We don't pay people to confess and we don't punish them for silence. We just price the silence."

**Decided policy (2026-09-15): never a hard rejection.** An agent with no record can still buy coverage, but at **5x premium** and **10% of the normal cap**. Reporting improves the terms. A disclosed *bad* record is still better than no record, which is exactly the incentive we want.

**Why not a reward:** it invites fabrication and we cannot fund a pool. **Why not staking as the primary:** staking makes *lying* expensive but does nothing about *silence* — and silence is what we measured (827,827 agents, ~0 feedback).

**Proven by:** Sherlock Shield (current product) scales coverage from $500k down to $1k as disclosed findings rise. Traditional insurance has always treated disclosure as a condition, with non-disclosure causing denial or rescission. Neither pays for honesty; both price concealment.

**Honest limitation:** this compels disclosure only from agents that *want coverage*. Stages 2-3 (condition of listing, portability via ERC-8004) extend it. Full analysis in `docs/INCENTIVE_MECHANISM_DESIGN.md`.

**One important design consequence:** the three *read* MCP tools (`get_agent_identity`, `get_agent_risk`, `list_incidents`) make the product useful **before** anyone reports, by exposing ERC-8004 identity and risk lookups. That decouples early value from data volume.

---

## 9. What We Explicitly Do NOT Do (scope boundaries)

- ❌ **ZK/zkML** — unnecessary; our triggers are deterministic, not semantic
- ❌ **Cleanverse** — docs gated behind an invitation code, requires company KYC. Not worth the $2k
- ❌ **Dynamic** — Privy chosen instead (final decision)
- ❌ **Selling insurance** — no license; this is a testnet prototype
- ❌ **Claim voting/committees** — the lesson from Nexus Mutual and InsurAce failures
- ❌ **Paid models** — every tool used is free

---

## 10. Document References

| Document | Contents |
|---|---|
| `PLAN.md` | **28-day execution plan + swarm work guide + full research context** |
| `CLAIMLESS_DEEPDIVE.md` | Business models (6 real cases), market evidence, DeFi failures |
| `BOUNTY_STRATEGY.md` | All 12 "All tracks" bounties (~$43k), cluster stacking |
| `SPONSOR_FEASIBILITY.md` | Free-tier feasibility per sponsor |
| `WALLET_DECISION.md` | Privy vs Dynamic |
| `AGENT_INSURANCE_RESEARCH.md` | Nexus/Sherlock/Armilla mechanics |

> Note: `PLAN.md` §9 is self-contained. If you only receive `IDEA.md` and `PLAN.md`, you have everything you need.
