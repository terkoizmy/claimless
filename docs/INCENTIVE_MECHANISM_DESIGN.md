# Stage 3: The Incentive Mechanism (VERIFIED 2026-09-15)

> The question: **should we build a reward system or staking?**
> The answer: **neither, as the primary mechanism.** The mechanism that actually works — and that we can already afford — is **disclosure as a condition of coverage**. Staking is a secondary layer for disputes only.

## 0. The three candidate mechanisms

| Mechanism | How it works | Who pays | Verdict |
|---|---|---|---|
| **A. Reward** | Pay people for reporting | We need a funded pool | ❌ Reject as primary |
| **B. Staking** | Reporter stakes; loses stake if the report is false | Reporter | ⚠️ Keep, but only for disputes |
| **C. Condition of coverage** | No disclosure → no coverage, or smaller coverage / worse premium | **Nobody — it's a price signal** | ✅ **Adopt as primary** |

## 1. Why "reward" (A) is the wrong primary mechanism

**The fabrication problem.** If reporting pays, then fabricating reports also pays. We would need a verification layer to filter, and the verification layer is exactly the human-judgment machine that killed InsurAce, Cover Protocol, and Nexus Mutual. We would be rebuilding the thing we designed Claimless to avoid.

**We cannot fund it.** A reward pool needs money. Our entire plan is zero-cost and we are pre-revenue. A reward pool would either be fake (unfunded promises) or require us to put in real money, violating the no-money rule.

**There is a subtler problem.** Paying for reports about *your own* agent is incoherent — the reporter is the party harmed by disclosure. So rewards can only go to *third-party* reporters, which means we depend on strangers caring about agents they do not own. That is a much harder cold start, not an easier one.

**What the research says:** reward-for-reporting does work in one proven case — **Immunefi / bug bounties**, where the *protocol being reported on* pays the researcher for a valid finding. Note the direction: the **payer is the party being exposed**, not a neutral fund. That is a real model, but it requires the exposed party to voluntarily fund its own exposure, which only happens when a bug bounty is cheaper than the alternative. We should keep this in mind as a *later* revenue model, not a cold-start fix.

## 2. Why "staking" (B) alone is insufficient

Staking is proven and elegant. **UMA's optimistic oracle** (VERIFIED):

> "A bond amount that proposers must risk to propose the request"
> "The proposer bond incentivizes proposers to post only correct proposals."
> "Correct disputes are rewarded with a portion of the forfeited proposer bond."

And the escalation layer:
> "Disputes resolve when a minimum **65%** majority of staked UMA is cast in favor of a single outcome. Stakers who did not vote, or who voted against the majority, are slashed."

**The mechanism is sound, but it solves the wrong half of our problem.** Staking makes *lying* expensive. It does not make *silence* expensive. If nobody reports at all, no bond is ever posted and the registry stays at 827,827-for-zero.

Compare the two failure modes:

| Failure | Staking fixes it? |
|---|---|
| Someone posts a **false** report | ✅ Yes — they lose their bond |
| **Nobody posts anything** | ❌ No — there is nothing to challenge |

Our measured problem is the second one. That is why staking cannot be the primary mechanism.

## 3. The mechanism that works: disclosure as a condition of coverage (C)

### 3.1 It is proven, in this exact industry, right now

**Sherlock Shield** (VERIFIED, and it is Sherlock's **current** product — unlike their V1/V2 coverage protocol, which was formally deprecated on **September 10, 2026**):

Coverage amount is a direct function of how many vulnerabilities were found:

| Points (Med=1, High=5) | Coverage amount |
|---|---|
| 0 | $500,000 |
| Less than 3 | $250,000 |
| Less than 6 | $200,000 |
| ... | ... |
| 30 or more | $1,000 |

> "Like golf, you want your score to be as low as possible so you can access the maximum amount of coverage."

**Read that carefully.** A worse disclosed safety record means **less coverage**. Nobody is paid to report. Nobody is slashed. The disclosure is simply **priced**.

### 3.2 It is also how traditional insurance works

From the research: in traditional insurance, **disclosing your claims history is a condition of getting coverage**, and non-disclosure results in **denial or rescission** of the policy. There is no reward for honesty. There is a *penalty for concealment*.

This is a centuries-old, battle-tested mechanism. It is not a crypto experiment.

### 3.3 Why this fits Claimless better than anything else

**We already have the lever.** We are building `CoverPool` and `ParametricTrigger` anyway. The pool is the thing agents want. So we can attach a condition to it:

```
Agent wants coverage
        │
        ▼
Must present a risk record
        │
   ┌────┴─────┐
   ▼          ▼
Disclosed   No record
   │          │
   ▼          ▼
Priced on   Cannot buy, or
real data   coverage capped / premium surcharged
```

**Silence now has a price.** Not a punishment, not a reward — just a worse quote. That is politically and economically far easier to defend than slashing.

**It costs us nothing.** We need no reward pool. We need no treasury. The mechanism is a pricing rule inside a contract we were already writing.

**It mirrors the lesson from the DeFi insurance graveyard.** InsurAce, Cover Protocol, and Nexus Mutual all died on *discretionary adjudication of claims*. Disclosure-as-condition is not adjudication at all. It is deterministic: either a record exists or it does not.

**It closes the loop with ERC-8004.** We read identity from ERC-8004, we publish risk summaries back to ERC-8004, and the coverage price is derived from our `RiskScore`. Three contracts, one coherent pipeline, and the incentive is built into the price.

### 3.4 The honest limitation

This mechanism only compels disclosure **from agents who want coverage**. It does nothing for agents that never buy coverage. So cold start is *reduced*, not *eliminated*.

The staged answer to that:

| Stage | What compels disclosure |
|---|---|
| 1 | **Condition of coverage** — the covered set must disclose |
| 2 | **Condition of listing** — anyone advertising on our dashboard must disclose |
| 3 | **Portability** — ERC-8004 carries the record, so third parties can require it |

Stage 1 is enough for a working demo and a defensible thesis. Stages 2-3 are growth.

## 4. Recommended design: asymmetric, three-part

**Do not build one mechanism. Build three, with clearly different jobs.**

| Layer | Mechanism | Job | Cost to us |
|---|---|---|---|
| **1. Pricing** | Disclosure-as-condition (Sherlock Shield pattern) | Make silence expensive | $0 |
| **2. Disputes** | Challenge bond (UMA pattern) | Make false reports expensive | $0 |
| **3. Escalation** | Deferred — see §6 | Resolve real conflicts without us | $0 (not built) |

### 4.1 Layer 1 — pricing (primary)

`CoverPool.buyCover(agentId, ...)` requires a **risk record** for `agentId`:

- No record → coverage refused, or a hard cap (e.g. minimum viable coverage only).
- Record exists → price and capacity derived from `RiskScore`.
- Better record → cheaper premium and larger capacity.

**No new contract needed.** This is a modifier on a contract already in the plan.

### 4.2 Layer 2 — dispute bond (secondary)

`IncidentRegistry.reportIncident(...) payable` requires a stake. Anyone may challenge with a matching stake. Resolution:

- Unchallenged within the challenge window → **accepted** (optimistic, UMA pattern).
- Challenged → resolved by the escalation layer (§6), loser forfeits bond to winner.
- **Silence by the accused = the report stands.** This is the "assumption of correctness" UMA uses.

This makes lying costly without requiring us to build a committee. Note honestly: this *does* introduce a resolution step, which is where complexity and judgment creep back in. Keep the window short and the bond small so disputes are rare.

### 4.3 What we deliberately do NOT do

- ❌ **No reward for reporting.** Invites fabrication; we cannot fund it.
- ❌ **No token.** A governance/staking token would be a second product, needs liquidity, and adds a regulatory surface.
- ❌ **No committee, no vote.** Same reason Claimless exists. UMA itself needed 65% staked consensus; we should not need even that for a testnet prototype.
- ❌ **No slashing of reporters for non-disclosure.** A worse price is enough, and far easier to defend.

## 5. Evidence that constrains this design

| Finding | Source | Consequence for us |
|---|---|---|
| Sherlock V1/V2 coverage **deprecated Sept 10, 2026**; inactive since 2024 | `docs.sherlock.xyz/coverage/sherlock-v1-and-v2-deprecation-notice` | Do **not** cite V1/V2 as "working". Cite **Shield**, which is current. Important for credibility. |
| Sherlock Shield prices coverage by disclosed findings | same docs | Our Layer 1 pattern |
| UMA bond = refundable if correct; loser forfeits | `docs.uma.xyz` | Our Layer 2 pattern |
| UMA needed **65%** staked majority + slashing for disputes | `docs.uma.xyz` | Confirms dispute resolution is expensive; keep disputes rare |
| Kleros: creator pays arbitration fees; PNK staked and slashed for incoherent votes | researcher (VERIFIED) | Confirms a bond is the standard primitive |
| Immunefi: the **exposed protocol** funds the reward | researcher (VERIFIED) | Reward model exists but payer = the exposed party |
| Traditional insurance: disclosure is a **condition**; non-disclosure → denial/rescission | researcher (VERIFIED) | Our core mechanism is not novel, it is standard |
| Graph curation: staking on subgraphs creates signal; 10% of query fees | researcher (VERIFIED) | Staking-as-signal works but needs fee flow |

## 6. Escalation: deliberately deferred

For the hackathon, we should **state the escalation path and not build it**. That is honest and it avoids rebuilding a committee.

Options to name in the docs (pick one as "future work"):

1. **UMA Optimistic Oracle** — Sherlock's own Level 3 uses it, and Sherlock pays ~$15k to escalate. Proven, but not free.
2. **Deterministic evidence checks** — for narrow trigger types (e.g. an HTTP status code, a signed latency log), no oracle is needed because the condition is machine-checkable. **This is the honest first choice for us**, and it matches our existing "narrow, deterministic triggers" decision in `IDEA.md`.
3. **Third-party attestation** — an auditor's on-chain attestation as evidence, referenced by hash.

**Recommendation:** choose (2). It keeps "zero human adjudication" true, which is our whole thesis.

## 7. Summary answer

| Question | Answer |
|---|---|
| Reward system? | **No.** Cannot fund it; invites fabrication; wrong reporter direction. |
| Staking? | **Yes, but only for disputes**, as a small refundable bond. Not the primary mechanism. |
| Primary mechanism? | **Disclosure as a condition of coverage.** Silence gets a worse price or no coverage. Costs $0, needs no fund, needs no committee, is proven by Sherlock Shield's current product, and matches how traditional insurance has always worked. |

**One-line version for the pitch:**
> "We don't pay people to confess and we don't punish them for silence. We just price the silence. No record means no coverage."

## 8. Sources

| Source | Used for |
|---|---|
| `https://docs.sherlock.xyz/coverage/sherlock-shield.md` | coverage priced by disclosed findings (VERIFIED) |
| `https://docs.sherlock.xyz/coverage/sherlock-v1-and-v2-deprecation-notice.md` | V1/V2 deprecated Sept 10 2026 (VERIFIED) |
| `https://docs.sherlock.xyz/bug-bounties/post-launch-bounty/dispute-resolution.md` | 3-tier court; $1k and ~$15k escalation fees (VERIFIED) |
| `https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work` | bond, challenge period, 65% DVM, slashing (VERIFIED) |
| `https://docs.sherlock.xyz/bug-bounties/criteria-for-bug-bounty-reports-validity.md` | what makes a report valid; duplication rules (VERIFIED) |
| researcher (Kleros, Graph, Immunefi, EigenLayer, traditional insurance) | comparative mechanisms (VERIFIED, per-claim; TVL and a reward-farming failure case were NOT FOUND) |
