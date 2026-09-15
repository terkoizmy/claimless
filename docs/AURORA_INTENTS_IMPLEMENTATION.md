# Aurora Intents Integration — Implementation Guide

> Created: 2026-09-15 · Companion to `VERDICT_OPEN_QUESTIONS.md`
> Source: coordinator primary research (`docs.intents.aurora.dev`, `docs.near-intents.org`, `auroracloud.dev`) + swarm agent
> Every claim marked VERIFIED or UNCERTAIN

---

## 0. Answer: YES — and it is better than expected

**VERIFIED.** "Aurora Intents" is a **named product with its own documentation site**, not just a rebrand.

| Item | Detail |
|---|---|
| Product name | **Aurora Intents** |
| Docs | `docs.intents.aurora.dev` |
| Studio (API keys) | `studio.aurora.dev` |
| API base | `https://intents-api.aurora.dev` |
| Powered by | **NEAR Intents** (as the bounty states) |
| **Monad** | ✅ **SOURCE and DESTINATION both supported** |

**Best part:** Aurora Intents has a product called **"Intents Deposits"** whose tagline is literally:
> *"The simplest way to enable cross-chain deposits into your app or protocol. Users can deposit from any chain and asset, while your app receives funds on the target chain, **with optional execution on arrival**."*

That matches the bounty phrase **"any-chain deposits... or deposit-and-execute flows"** almost word for word.

---

## 1. The three Aurora Intents products

| Product | Purpose | Fit for us |
|---|---|---|
| **Intents Connect** | Core cross-chain execution infrastructure | Overkill — low-level |
| **Intents Deposits** ⭐ | Cross-chain deposits into your app, with optional execution on arrival | **Perfect fit** |
| **Swap Widget** | Plug-and-play component, no backend | Good for a quick demo |

**We use Intents Deposits (API integration).**

---

## 2. Monad support — VERIFIED both directions

From `docs.intents.aurora.dev/intents-deposits/supported-chains`:

| Chain | SOURCE | DESTINATION |
|---|---|---|
| **Monad** | ✅ Supported | ✅ Supported |

Other supported chains include: Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Avalanche, Solana, Bitcoin, TON, Tron, Sui, Aptos, Starknet, Stellar, XRP, Zcash, Dogecoin, Litecoin, Cardano, Hyperliquid, NEAR, Aurora, and more (~30 total).

**Implication:** an underwriter can deposit from **any** of these chains and we receive on Monad.

---

## 3. API — concrete (VERIFIED)

| Item | Value |
|---|---|
| Base URL | `https://intents-api.aurora.dev` |
| Auth | API key in the URL path: `/api/tokens/${appKey}` |
| API key portal | `studio.aurora.dev` |
| Note | *"The API key is not confidential, allowing its use in public-facing services"* |

### Flow (4 steps)

```
1. GET  /api/tokens/${appKey}
        → find assetIds (filter for monad)

2. POST /api/quote/${appKey}
        → returns depositAddress

3. Send tokens to depositAddress on the origin chain
        → swap processes automatically

4. GET  /api/transactions/${appKey}?walletAddress=...
        → monitor status
```

### Quote parameters (VERIFIED)

| Parameter | Description |
|---|---|
| `dry` | `true` = validate and get quote **without executing** |
| `swapType` | `EXACT_INPUT` or `EXACT_OUTPUT` |
| `slippageTolerance` | Basis points (100 = 1%) |
| `originAsset` | Source `assetId` |
| `depositType` | `ORIGIN_CHAIN` or `INTENTS` |
| `destinationAsset` | Target `assetId` |
| `amount` | Smallest unit (wei, yoctoNEAR, etc.) |
| `recipient` | Receiving address |
| `recipientType` | `DESTINATION_CHAIN` or `INTENTS` |
| `refundTo` | Refund address if swap fails |
| `refundType` | `ORIGIN_CHAIN` or `INTENTS` |
| `deadline` | ISO timestamp |

### Status values (VERIFIED)

| Status | Meaning |
|---|---|
| `PENDING_DEPOSIT` | Awaiting deposit |
| `KNOWN_DEPOSIT_TX` | Deposit detected |
| `PROCESSING` | Swap executing |
| `SUCCESS` | Tokens delivered |
| `INCOMPLETE_DEPOSIT` | Deposit below required amount |
| `REFUNDED` | Failed, funds returned |
| `FAILED` | Error |

**`dry: true` is very useful for us** — we can demo the full flow without real funds.

---

## 4. Fees — VERIFIED, and favorable

| Item | Value |
|---|---|
| Split | **60% Integrator / 40% Aurora** |
| Aurora fee floor | **2 bps** minimum: `max(2 bps, 40% of integrator fee)` |
| Maximum fee | **100 bps** |

**Examples:**
| Integrator fee | You keep (60%) | Aurora takes |
|---|---|---|
| 0 bps | 0 bps | 2 bps |
| 5 bps | 3 bps | 2 bps |
| 10 bps | 6 bps | 4 bps |
| 20 bps | 12 bps | 8 bps |

**Two things this means:**
1. **We can earn fees** (up to 60% of a fee we set, max 100 bps total)
2. Aurora only takes **2 bps minimum** — very cheap for a hackathon-scale integration

---

## 5. Concrete integration for Claimless

### Use case: underwriter deposits from any chain into the coverage pool

```
Underwriter (Ethereum / Base / Solana / Bitcoin ...)
        │  sends USDC
        ▼
Aurora Intents API  ──►  NEAR Intents settlement
        │
        ▼  delivers USDC on Monad
CoverPool.deposit()  ──►  coverage capacity increases
```

### Code (TypeScript)

```typescript
// sdk/src/intents.ts
const BASE = 'https://intents-api.aurora.dev';
const APP_KEY = process.env.AURORA_INTENTS_APP_KEY!;

// 1. Discover Monad assets
export async function getAssets() {
  const res = await fetch(`${BASE}/api/tokens/${APP_KEY}`);
  const tokens = await res.json();
  return tokens.filter((t: any) =>
    String(t.blockchain).toLowerCase().includes('monad')
  );
}

// 2. Quote: pay on any chain, receive USDC on Monad
export async function quoteDeposit(params: {
  originAsset: string;        // e.g. USDC on Arbitrum assetId
  monadAsset: string;         // USDC on Monad assetId
  amount: string;             // smallest unit
  poolAddress: string;        // our CoverPool on Monad
  refundTo: string;           // underwriter's origin address
  dry?: boolean;
}) {
  const res = await fetch(`${BASE}/api/quote/${APP_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dry: params.dry ?? false,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,                      // 1%
      originAsset: params.originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: params.monadAsset,
      amount: params.amount,
      recipient: params.poolAddress,
      recipientType: 'DESTINATION_CHAIN',
      refundTo: params.refundTo,
      refundType: 'ORIGIN_CHAIN',
      deadline: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    }),
  });
  return res.json();   // contains depositAddress
}

// 3. Track
export async function getStatus(walletAddress: string) {
  const res = await fetch(
    `${BASE}/api/transactions/${APP_KEY}?walletAddress=${walletAddress}`
  );
  return res.json();
}
```

### Demo strategy (important)

Because there is **no testnet** (VERIFIED: *"There is no testnet version of NEAR Intents — use small amounts for test swaps"*):

| Stage | Method | Real money? |
|---|---|---|
| UI demo | `dry: true` quote | ❌ No |
| Optional live proof | Small real swap (e.g. $1-5 USDC) | ✅ Yes, tiny |

**The demo works without real funds** by showing the quote and status flow with `dry: true`.

### Bonus: synergy with Mera and Privy
- Underwriter signs with **Mera passkey** (ERC-191 compatible)
- Agents sign with **Privy** (ephemeral key)
- Both produce signatures the intents flow can consume

---

## 6. Where it fits

```
┌──────────────────────────────────────────────────────────┐
│ UNDERWRITER (human) — Mera passkey login                  │
│   Deposit from ANY CHAIN via Aurora Intents              │ ◄── NEW ($5k)
└──────────────────────┬───────────────────────────────────┘
                       │ delivers stablecoin on Monad
                       ▼
┌──────────────────────────────────────────────────────────┐
│ MONAD                                                     │
│   CoverPool.deposit() ← capacity increases                │
│   IncidentRegistry · RiskScore · ParametricTrigger        │
└──────────────────────┬───────────────────────────────────┘
                       ▲
                       │ reports incidents (Privy wallet)
┌──────────────────────┴───────────────────────────────────┐
│ AUTONOMOUS AGENT                                          │
└──────────────────────────────────────────────────────────┘
```

**Not needed for the core loop.** It is a **friction-reduction feature** for the deposit step. If it proves hard, the core demo still works.

---

## 7. Risks & caveats

| Risk | Detail | Mitigation |
|---|---|---|
| **No testnet** | VERIFIED — real money needed for live swap | Demo with `dry: true`; optional tiny real swap |
| **Monad asset IDs unknown** | Not yet retrieved | Call `/api/tokens/{appKey}` first |
| **API key needed** | From `studio.aurora.dev` | Register; key is not confidential |
| **Settlement not trustless** | Funds custodied by NEAR Intents during swap | Disclose honestly; not a blocker |
| **Extra integration time** | Est. 2-3 days | Schedule week 3, after core loop works |
| **Separate from NEAR's own 1Click API** | Aurora has its own API surface | Use Aurora's (matches the bounty wording) |

**Note on API choice:** NEAR Intents also offers the 1Click API (`1click.chaindefuser.com`). Aurora Intents wraps the same protocol with its own API and fee split. Since the bounty names **Aurora Intents** specifically, use `intents-api.aurora.dev`.

---

## 8. Updated bounty target

| Sponsor | Value |
|---|---|
| Privy | $5,000 |
| Nansen | $5,000 |
| Mera ×2 | $5,000 |
| **Aurora Intents** | **$5,000** |
| Chainlink CRE | $3,000 |
| Envio | $1,000 |
| **Total** | **$24,000** |

Plus potential integrator fee revenue (up to 60% of a fee we set).

---

## 9. Implementation plan (~3 days, week 3)

| Day | Task | Deliverable | Gate |
|---|---|---|---|
| W3-1 | Register at `studio.aurora.dev`, get API key. Call `/api/tokens/{key}` | `docs/intents-assets.md` | Monad USDC assetId confirmed |
| W3-2 | Implement `getAssets()`, `quoteDeposit()`, `getStatus()` | `sdk/src/intents.ts` | `dry: true` quote returns valid response |
| W3-3 | UI: "Deposit from any chain" + status tracker | Dashboard section | Quote visible in UI |
| W3-4 | Wire into `CoverPool.deposit()` | Capacity increases after `SUCCESS` | End-to-end deposit → capacity |
| W3-5 (optional) | Signed-intent flow (`depositType: INTENTS`) | `sdk/src/intents-signed.ts` | generate → sign → submit works |
| W3-6 | Document + record in demo video | Docs + video | Bounty requirement met |

**Minimum viable (2 days):** quote (`dry: true`) + status display. Satisfies "any-chain deposits" without real funds.

---

## 10. Bounty wording check

> **"Bring Any-Chain Liquidity to Monad"** — Aurora Intents
> "Integrate Aurora Intents (powered by NEAR Intents) into a Monad app for any-chain deposits, swaps, or deposit-and-execute flows."
> **$5,000 USD** · All tracks

| Requirement | Our compliance |
|---|---|
| Integrate **Aurora Intents** | ✅ Using `intents-api.aurora.dev` |
| **powered by NEAR Intents** | ✅ Aurora Intents is NEAR Intents-backed |
| **into a Monad app** | ✅ Claimless runs on Monad |
| **any-chain deposits** | ✅ Intents Deposits |
| **deposit-and-execute** | ✅ Optional execution on arrival |

**Strong match on every clause.**

---

## 11. Sources

| Source | Used for |
|---|---|
| `docs.intents.aurora.dev/` | Product overview: 3 products (VERIFIED) |
| `docs.intents.aurora.dev/intents-deposits/supported-chains` | Monad source+destination (VERIFIED) |
| `docs.intents.aurora.dev/intents-deposits/quickstart/api-integration` | API endpoints + parameters (VERIFIED) |
| `docs.intents.aurora.dev/getting-started/api-keys-and-fees` | Fee split 60/40, 2 bps floor (VERIFIED) |
| `docs.near-intents.org/resources/chain-support` | Monad in NEAR Intents EVM list (VERIFIED) |
| `docs.near-intents.org/resources/fees` | No testnet, small amounts (VERIFIED) |
| `studio.aurora.dev` | API key generation (VERIFIED) |

---

## 12. Testnet, minimums, and funding (VERIFIED 2026-09-15)

### 12.1 Testnet: DOES NOT EXIST

NEAR Intents FAQ, verbatim:

> **"Is there a testnet deployment?"** — "There is **no testnet deployment and no plans for one**. We recommend testing on NEAR mainnet using separate dev/test NEAR accounts."

Corroborated by the Aurora Intents `llms.txt` index: all ~100 doc pages are listed, and **not one** is a testnet, sandbox, or staging page.

**Consequence:** any real swap uses real funds. The `dry: true` flag gives a full quote without executing, so a demo needs **zero funds**.

### 12.2 Minimum amount: NOT STATED, and effectively no barrier

| Field | Meaning | Observed value |
|---|---|---|
| `minAmountIn` | Minimum accepted input for the quote | Equals `amountIn` for EXACT_INPUT (not a floor) |
| `INCOMPLETE_DEPOSIT` | "Deposit below required amount" status | No documented numeric threshold |
| Dust rule | Only documented for BTC | "5,000 sats" (irrelevant here) |

No universal minimum exists in the docs. A sub-$1 swap quotes fine.

### 12.3 Live quote tests (real API, `dry: true`, no funds spent)

`POST https://1click.chaindefuser.com/v0/quote`, destination = Monad USDC (`nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx`).

| Origin | In | In USD | Out USDC | Out USD | Time | Notes |
|---|---|---|---|---|---|---|
| Base ETH | 0.0002 ETH | $0.496 | 0.493655 | $0.4936 | 39s | ~0.5% fee |
| Base ETH | 0.0004 ETH | $0.992 | 0.988264 | $0.9881 | 49s | ~0.4% fee |
| Ethereum ETH | 0.0004 ETH | $0.992 | 0.988264 | $0.9881 | 49s | works, high gas |
| Base USDC | 0.50 USDC | $0.500 | 0.498055 | $0.4980 | 37s | ~0.4% fee |

All four quoted successfully. **Minimum practical size is effectively ~$0.20-0.50**, not a stated limit.

### 12.4 The real blocker is gas, not minimums

Gas measured 2026-09-15 (owlracle v4). ETH $2,480.

| Chain | maxFeePerGas | Typical transfer | Cost |
|---|---|---|---|
| **Base** | 0.006 gwei | 21,000 gas | **~$0.0008** (negligible) |
| Ethereum mainnet | 0.126 gwei | 65,000 gas (USDC) | ~$0.020 (cheap today) |
| Ethereum mainnet | 1.09 gwei (fast) | 65,000 gas (USDC) | ~$0.18 |

Base gas is ~20x cheaper than mainnet and is **effectively free** at current prices. Mainnet is only viable while gas stays low; during congestion a single ERC-20 transfer can exceed $5 and would consume a sub-$1 balance.

### 12.5 USDC (Circle) is fully supported

USDC is a supported origin asset on: **Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, BNB Chain, Solana, Sui, Stellar, Gnosis, Hyperliquid, XLayer, Monad, NEAR**.

Asset IDs we need:

| Chain | USDC contract | assetId |
|---|---|---|
| Base | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` |
| Ethereum | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` |
| Monad (dest) | `0x754704bc059f8c67012fed69bc8a327a5aafb603` | `nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx` |

### 12.6 Funding recommendation

**Two-tier plan, unchanged in principle but now cheaper in practice:**

1. **Demo (zero cost):** `dry: true` quotes in the UI. All flows visible, no funds, no gas.
2. **Optional live proof (cents, not dollars):** one real swap of **$0.50 USDC on Base**. Out-of-pocket: $0.50 plus ~$0.001 gas. This produces a real on-chain tx hash and a real Monad USDC balance delta, which is much stronger evidence for judges.

**Avoid using the Ethereum-mainnet ETH balance for this.** Even though mainnet gas is low *today*, the balance is worth ~$0.99 and a gas spike can consume it or leave it stranded. Base USDC is the correct rail.

If the user holds only ETH (no USDC), Base ETH works too and auto-swaps to Monad USDC in one intent.

**Verdict: Aurora Intents is now compliant with the no-money rule.** Minimum needed for live proof: **$0.50**, versus the $1-5 previously estimated.

---

## 13. Can we do a FULL testnet run (no `dry`)? — Answer: partly, and it's better than expected

Question asked: is there a pure-testnet path, since Circle does issue USDC on Monad testnet but no Aurora testnet seems to exist.

### 13.1 The user is right on both counts

**Monad testnet USDC exists.** VERIFIED on-chain and in Circle docs:

| Property | Value |
|---|---|
| Circle doc listing | "Monad Testnet — `0x534b2f3A21130d7a60830c2Df862319e593943A3`" |
| On-chain check (`testnet-rpc.monad.xyz`) | Contract present, bytecode 3,598 chars |
| `symbol()` call | `USDC` |
| `name()` call | `USDC` |
| Monad testnet chain ID | `10143` (`0x279f`) |
| Monad testnet faucet | `faucet.monad.xyz` (gas) + `faucet.circle.com` (USDC) |

**Aurora Intents has no testnet.** VERIFIED three independent ways:

1. NEAR Intents FAQ: *"no testnet deployment and no plans for one."*
2. Aurora `llms.txt` index: ~100 pages, zero testnet pages.
3. The 1Click API asset registry: 189 assets, chain IDs present are `10, 56, 137, 143, 1100, 1117, 196, 43114, 534352, 9745, 36900` — **all mainnet**. No `10143` (Monad testnet), no `11155111` (Sepolia), no `84532` (Base Sepolia).
4. `testnet.1click.chaindefuser.com` and `staging.1click.chaindefuser.com` do not resolve (HTTP `000`).

The only testnet-flavoured token in the registry is `TESTNEBULA` (`nep141:test-token.highdome3013.near`), an unrelated NEAR meme token, not USDC.

### 13.2 What this actually means for the demo

The two layers are **independent**, and each can run on its own rail:

| Layer | Rail | Testnet available? |
|---|---|---|
| Claimless contracts (`IncidentRegistry`, `RiskScore`, `CoverPool`, `ParametricTrigger`) | Monad testnet (10143) | ✅ **Yes, fully** |
| Testnet USDC for pool deposits/premiums | Monad testnet USDC (Circle) | ✅ **Yes, via faucet** |
| Aurora Intents any-chain deposit leg | NEAR Intents mainnet only | ❌ **No — mainnet only** |

**Therefore a "full testnet, no dry-run" demo is possible for ~95% of the app.** Only the Aurora Intents hop itself cannot be testnet.

### 13.3 Recommended hybrid architecture (best of both)

Split the `CoverPool` funding path into two, routed by network:

```
Monad testnet (10143)  ──►  native testnet USDC (Circle faucet)  ──►  CoverPool.deposit()
                            [FULL TESTNET, no dry, no real funds]

Any chain mainnet      ──►  Aurora Intents (1Click)              ──►  CoverPool.deposit()
                            [REAL tx, cents, optional proof]
```

**What to show judges:**

1. **Primary demo — Monad testnet, fully live, zero cost.** Real contracts, real transactions, real testnet USDC moving into the pool. No `dry: true` anywhere. Faucet-funded. This is a genuine end-to-end run.
2. **Aurora Intents panel — `dry: true` quote** displayed live in the UI, with the asset list and a status tracker. Satisfies the bounty ("integrate Aurora Intents for any-chain deposits") without spending.
3. **Optional — one real $0.50 swap on Base** to produce a mainnet tx hash proving the Aurora leg works for real. Costs cents.

### 13.4 Why this is the strongest possible answer

- The claim "no testnet needed, our app is fully testnet-live" is **true** for everything except one sponsor's rail.
- Aurora Intents simply has no testnet; that is a **documented vendor limitation**, not our gap. Judges from Aurora will know this.
- We still demonstrate the Aurora integration completely via quotes plus an optional real proof.
- Total out-of-pocket to be fully credible: **$0 by default, $0.50 for optional live proof.**

### 13.5 Caveat on Monad testnet USDC

Monad testnet was **reset from genesis on 2025-12-16**, and docs warn canonical contracts get redeployed after resets. So:

- Always fetch the testnet USDC address from `https://docs.monad.xyz/developer-essentials/testnets` or Circle docs at build time; do not hardcode blindly.
- Keep `deployments/monad-testnet.json` regenerated after any reset.
- Add a startup check that the configured USDC address actually has bytecode, and fail loudly if not.

### 13.6 Final verdict

**Yes — a full testnet run without `dry` is achievable, and it is the recommended primary demo.** Aurora Intents is the single exception, because the vendor provides no testnet at all; for that one leg we use a live quote plus an optional cent-level real swap.

---

## 14. Can the Circle faucet USDC (Monad testnet / NEAR testnet) be used with Aurora? — No, and here is exactly why

This is the sharpest question so far, and the answer is a clean **no**. The faucet gives you testnet USDC, but Aurora Intents cannot see testnet USDC at all.

### 14.1 The two faucet tokens are absent from the Intents asset registry

Checked programmatically against the live registry (`GET /v0/tokens`, 189 assets):

| Faucet token | Contract / ID (from Circle docs) | Present in Intents registry? |
|---|---|---|
| Monad testnet USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | ❌ **NOT PRESENT** |
| NEAR testnet USDC | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | ❌ **NOT PRESENT** |

No asset in the 189-entry registry has `testnet` in its `blockchain` field or its `assetId`. The only testnet-flavoured entry is `TESTNEBULA`, an unrelated NEAR meme token.

### 14.2 There is no way to pass a testnet asset to the API

`originAsset` and `destinationAsset` must be **registry asset IDs**, not raw contract addresses. So there is no "hack" available: you cannot hand the API a testnet contract address and have it work, because the solvers have no route for it.

The full absence is consistent across every signal we checked:

| Signal | Result |
|---|---|
| NEAR Intents FAQ | *"no testnet deployment and no plans for one"* |
| Aurora `llms.txt` (~100 pages) | zero testnet pages |
| NEAR Intents `llms.txt` | zero lines matching `testnet\|staging\|sandbox\|devnet` |
| `testnet.` / `staging.` subdomains | do not resolve (HTTP `000`) |
| Registry chain IDs | all mainnet: `10, 56, 137, 143, 1100, 1117, 196, 43114, 534352, 9745, 36900` |
| Testnet chain IDs (`10143`, `11155111`, `84532`) | absent |

### 14.3 Why Aurora cannot simply add testnet support

This is not laziness, it is architectural. NEAR Intents works by having **solvers** (market makers) fill intents. A solver must be willing to lock real capital to fill a route, and it must price that route. Testnet tokens have no value, so:

- No solver has an incentive to provide testnet liquidity.
- There is nothing to settle against on a testnet verifier contract.
- The whole product is settlement of *value*; on a valueless testnet there is nothing to settle.

That is why the FAQ says "no plans for one" rather than "not yet".

### 14.4 Correct role of each faucet token

Do not discard the faucets; they are still useful, just not for Aurora:

| Token | Use it for | Not for |
|---|---|---|
| `faucet.monad.xyz` MON | Gas for deploying and calling Claimless contracts on Monad testnet | Aurora |
| Monad testnet USDC | `CoverPool.deposit()`, premiums, and parametric payouts in the **native** testnet flow | Aurora |
| NEAR testnet USDC | Nothing in this project (we do not deploy to NEAR testnet) | Aurora |

So the full-testnet demo is: **contracts + pool + triggers + native testnet USDC deposits**, all genuine and faucet-funded. Aurora sits alongside it as a **quote-only panel** (or one optional cent-level mainnet swap).

### 14.5 Is this a problem for the Bounty? — No

Re-read the bounty wording: it asks to *"integrate Aurora Intents into a Monad app for any-chain deposits, swaps, or deposit-and-execute flows."*

It does **not** require a testnet run. What it requires:

- The integration exists in the codebase (our `sdk/src/intents.ts`). ✅
- It is wired into a Monad app feature (the pool deposit path). ✅
- It is demonstrated in a video (`dry: true` quote + status tracker). ✅
- Feedback is given on the integration experience. ✅

Because Aurora itself has no testnet, **every** submitter faces this same constraint. Any judge from Aurora will already know testnet is impossible for their rail. Showing a clean `dry: true` integration plus an honest note about the missing testnet reads as competence, not as a gap.

### 14.6 One important honesty note for the demo video

Do **not** splice in fake mainnet screenshots and imply they came from testnet. Instead state plainly, once:

> "Aurora Intents has no testnet, so this leg is demonstrated with a live quote (`dry: true`) on mainnet assets. Every other part of Claimless runs fully on Monad testnet with faucet USDC."

That sentence turns a limitation into evidence that we read the docs carefully. Judges reward that.

### 14.7 Final answer

**No — faucet USDC from Circle (Monad testnet or NEAR testnet) cannot be routed through Aurora Intents, because testnet assets are absent from the Intents registry by design.** Aurora cannot be exercised on a faucet, by anyone. We use it as a live-quote integration plus an optional $0.50 mainnet proof, while the rest of Claimless runs a genuine full-testnet demo.

---

## 15. Do we need funds on the Aurora chain? — No. Not a single token.

This is a common and important misunderstanding. "Aurora Intents" is a **product brand**, not a chain you must fund.

### 15.1 What "Aurora Intents" actually is

Aurora's own docs, verbatim:

> "Aurora Intents is the **cross-chain execution layer** for on-chain applications."
> "Our API is **powered by NEAR Intents**, enabling cross-chain asset discovery, routing, and execution through a unified interface."

So Aurora Intents is:

- An **API + SDK + widget** layer that *you call* from your own app.
- A router on top of the NEAR Intents solver network.
- A way to move assets between ~30 chains.

It is **not** a chain. Aurora the chain is merely *one of the ~30 supported chains*, and we never touch it.

### 15.2 Our route does not involve the Aurora chain

Our use case is: *somebody brings liquidity from another chain into the Monad pool.*

```
Base USDC ──► Aurora Intents (1Click API) ──► Monad USDC
   ▲                  (router)                   ▲
   │                                              │
 gas paid here                            funds arrive here
 (~$0.001)
```

The Aurora chain is nowhere in this path. We verified this with a real quote:

> `POST /v0/quote` — Base USDC → Monad USDC, 1.00 USDC in, **0.996706 USDC out**, 37s estimate, HTTP 201.

No Aurora address, no Aurora balance, no Aurora gas.

### 15.3 The registry has no Aurora chain at all

We checked all 35 distinct `blockchain` values in the live asset registry. The full list:

`abs, adi, aleo, aptos, arb, avax, base, bch, bera, bsc, btc, cardano, dash, doge, eth, fogo, gnosis, hypercore, ltc, monad, movement, near, op, plasma, pol, scroll, sol, starknet, stellar, sui, ton, tron, xlayer, xrp, zec`

**There is no `aurora` chain.** The only "Aurora" entries are the AURORA *token*, and only in two places:

- `AURORA` on **NEAR**: `nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near`
- `AURORA` on **Ethereum**: `nep141:eth-0xaaaaaa20d9e0e2461697782ef11675f668207961.omft.near`

So even if we wanted to "fund Aurora", there is currently no Aurora chain route to fund. (Aurora's *deposits* doc lists Aurora as supported source/destination, but the live token registry we must pass asset IDs from does not expose an Aurora chain asset.)

### 15.4 Where money is actually required, and how little

| Requirement | Chain | Amount |
|---|---|---|
| Gas for the deposit transaction | **Origin chain** (e.g. Base) | ~$0.001 |
| Value being moved | **Origin chain** | whatever you send ($0.50 is enough) |
| Gas on destination | Monad | $0 (arrives as USDC, withdraw fee taken from the swap) |
| Aurora-chain balance | — | **$0. Never needed** |
| Aurora platform fee | Deducted inside the route | Not paid from any balance |

Aurora's 2 bps floor and the 60/40 fee split are **deducted from the routed amount**, not billed to an Aurora account. Integrator fees are set by us via the `appFees` parameter (a quote returned `appFees: [{recipient: "5880ad2b...", fee: 25}]`), so it is our revenue, not our cost.

### 15.5 Practical consequence for the plan

The funding plan is unchanged and even simpler than feared:

1. **Demo:** `dry: true` quotes — **$0**, no chain funded at all.
2. **Optional live proof:** send **$0.50 USDC on Base** to the returned deposit address. Gas on Base is ~$0.001. **No Aurora balance, ever.**

### 15.6 Final answer

**No — you do not need any balance on the Aurora chain to run an intent.** Aurora Intents is a routing layer, not a chain we transact on. We only need value plus gas on the **origin** chain (Base), and even that only for the optional live proof. The default path costs nothing.
