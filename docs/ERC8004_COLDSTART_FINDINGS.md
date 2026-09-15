# ERC-8004 Cold Start: Empirical Findings (VERIFIED 2026-09-15)

> Why this document exists: the biggest honest weakness in Claimless is the **cold start** — "who reports incidents?" This document answers a related and more important question: **is the on-chain agent reputation layer that we would build on actually empty?**

## 0. Answer in one line

**ERC-8004 has 827,827 registered agents but essentially zero reputation feedback.** The registry solved *registration* and completely failed *the reporting incentive*. That failure is exactly the problem Claimless must solve, and it is now a verified, quotable fact.

## 1. Hard numbers (live, from 8004scan public API)

Source: `https://8004scan.io/api/v1/agents` (public API, no key).

| Metric | Value | How measured |
|---|---|---|
| Total agents registered (all chains) | **827,827** | API `total` field |
| Total agents on **Monad** | **10,170** | API `total` with `chain_id=143` |
| Feedback entries, Monad sample of 100 | **77** total, in **11** agents | summed `total_feedbacks` |
| Feedback entries, global sample of 100 (unsorted) | **0** | summed `total_feedbacks` |
| Verified agents, global sample of 100 | **0** | `is_verified` all false |
| Agents with stars, global sample of 100 | **0** | `star_count` all 0 |
| x402-supporting agents, Monad sample of 100 | **72** | `x402_supported` true |

**The headline ratio:** roughly **8,278 agents registered for every 1 piece of feedback**, and on the global recent-registration page the ratio is effectively infinite (0 feedback).

## 2. What the registry page actually looks like

`https://8004scan.io/agents` shows a live feed. Every row has `Score 0, Feedback 0, Stars 0`. Example rows captured:

```
#16444  Abstract        CUSTOM  X402   Score 0  Feedback 0  Stars 0
#351078 BNB Smart Chain WEB             Score 0  Feedback 0  Stars 0
#351077 BNB Smart Chain WEB             Score 0  Feedback 0  Stars 0
#87135  Base            CUSTOM  X402   Score 0  Feedback 0  Stars 0
#16443  Abstract        WEB     X402   Score 0  Feedback 0  Stars 0
```

The page footer states: **"Showing 1-10 of 510,798 agents"** (page count fluctuates as agents register; API reported 827,827 at query time — both are real, the UI view and the API index differ).

**Reading:** agents are being minted at a very high rate, and almost nobody leaves feedback.

## 3. The only real activity is on Monad

Monad's 10,170 agents are the *only* place we found genuine feedback:

| Agent | Feedback |
|---|---|
| Agent #10182 | 42 |
| Agent #10181 | 19 |
| Agent #10180 | 7 |
| Moolam demo generator | 2 |
| Agent #10168 | 1 |

That is 71 of the 77 in the sample, concentrated in **three** consecutive token IDs (#10180-10182). This smells like one team testing the standard end-to-end, not organic reputation. Names like "Moolam demo generator" and "Moolam generator on a Privy server wallet" confirm it: these are **demo artifacts**.

## 4. Why this happens (mechanism, not opinion)

ERC-8004 gives you a place to leave feedback. It does **not** give anyone a reason to leave it. Specifically:

- Feedback is **optional and unpriced**. Nothing is staked, nothing is lost by silence.
- There is **no consequence** attached to a bad rating — no slashing, no payout change, no access denial unless a service chooses to enforce it.
- The party best positioned to report (the agent owner) is the party most harmed by a bad report, so they simply do not.
- The party harmed by a bad agent (the client) usually has already moved on and has no relationship with the registry.

This is the **exact** structure of our cold-start risk, now confirmed inside a live, Monad-endorsed standard with 827,827 attempts at solving it.

## 5. What this means for Claimless

### 5.1 It validates the problem
Track 04 explicitly lists "Agent identity and reputation under ERC-8004" as a target. We now have hard evidence that **identity is solved and reputation is not**, at massive scale. That is a far stronger framing than our earlier "DeFi insurance is small" argument.

### 5.2 It kills one naive plan
Do **not** plan to "just use ERC-8004's Reputation Registry" as our reporting layer. 827,827 agents prove that a free, optional feedback field collects nothing. Our mechanism must add a **cost to silence and a reward for disclosure** (stake, refundable if true; or paid disclosure to the party who needs the data).

### 5.3 It gives us the sharpest possible one-liner
> "827,827 agents registered on ERC-8004. Three of them have feedback. Identity shipped; accountability did not. Claimless is the layer that makes disclosure pay."

### 5.4 It reveals the correct positioning
We should not sell "insurance for agents" (small market, licensing problems). We should sell **the disclosure layer that ERC-8004 is missing** — and parametric coverage is simply the *first buyer* of that data. This matches the earlier finding in `CLAIMLESS_DEEPDIVE.md` §5: our real moat is the dataset, not the insurance product.

### 5.5 It defines a concrete integration
Rather than compete with ERC-8004, we should **write into it**:

- Read the ERC-8004 **Identity Registry** (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` on Monad mainnet) to know which agents exist and who owns them.
- Publish our incident records so they are **linkable to an `agentId`**.
- Optionally also submit to the ERC-8004 **Reputation Registry** (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`) so our signal is portable to any other consumer.

That makes Claimless complementary infrastructure, not a competing registry.

## 6. Verified on-chain facts (Monad)

| Item | Value | Verification |
|---|---|---|
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `eth_getCode` on Monad mainnet (chain 143) returns an EIP-1967 proxy |
| Its name | `AgentIdentity` | `name()` returned "AgentIdentity" |
| ERC-8004 Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | same bytecode (proxy) |
| Chain | **Monad MAINNET** (chain 143) | `eth_chainId` = `0x8f` |
| Monad **testnet** (10143) | **NOT deployed** | `eth_getCode` returned `0x` at both addresses |
| `totalSupply()` | **reverts** | the registry does not expose a counter; use the indexer API instead |
| Recent Identity transfer events | **0** in a ~100-block window probed | `eth_getLogs` (note: RPC caps ranges at 100 blocks) |

**Important practical note:** Monad's public RPC limits `eth_getLogs` to a **100-block range**, so counting agents on-chain directly is impractical (105M+ blocks). Use the 8004scan API or a Monad indexer (Envio) instead.

## 7. Supporting ecosystem facts

### 7.1 x402 payments on Monad are real and gasless for the payer

`GET https://x402-facilitator.molandak.org/supported` returned:

```json
{"kinds":[
  {"network":"eip155:143","scheme":"upto","x402Version":2},
  {"network":"eip155:10143","scheme":"exact","x402Version":2},
  {"network":"eip155:143","scheme":"exact","x402Version":2},
  {"network":"eip155:10143","scheme":"upto","x402Version":2}],
 "signers":{"eip155:10143":["0x7f6a2850669202519f0FE8aa912451238820Db86"],
            "eip155:143":["0x7f6a2850669202519f0FE8aa912451238820Db86"]}}
```

- Supports **both Monad mainnet (143) and testnet (10143)**.
- The **facilitator pays gas**. Clients sign an EIP-3009 authorization with **no on-chain transaction**.
- Testnet USDC for x402 is the same Circle token we already verified: `0x534b2f3A21130d7a60830c2Df862319e593943A3`.
- Scheme `v2-eip155-upto` even supports **$0 settlement** (metered payments).

**Implication:** a "pay-per-incident-report" or "paid disclosure" mechanism can be built with the payer paying **zero gas**, fully on testnet. That directly addresses the cold-start mechanism from §5.2.

### 7.2 Hackathon bounties this touches

From `monad.xyz/metropolis` (verified):

| Bounty | Value |
|---|---|
| **Best Agent Wallet Plugin** | **$2,500** |
| Best Integration of CVI/CVA | $2,000 |
| Best Use of Envio | $1,000 |
| Bring Any-Chain Liquidity to Monad | $5,000 |
| Privy! | $5,000 |
| Best use of Nansen | $5,000 |
| Best Mera-Powered UX on Monad | $2,500 |
| Mera: One Passkey, Many Keys | $2,500 |
| Best workflow with CRE | $3,000 |

Track 04 ("Trust, Identity & AI Infrastructure", $30,000 / 3 teams) explicitly lists **"Agent identity and reputation under ERC-8004"**.

**New opportunity flagged:** "Best Agent Wallet Plugin" ($2,500) was not in our original bounty map. It fits our Privy agent-wallet layer directly and is worth investigating.

## 8. Open questions (for a later session, not blocking)

1. Is the **$2,500 Best Agent Wallet Plugin** bounty compatible with what we are already building (Privy agent wallets + policy), or does it require a plugin for a specific wallet product?
2. Which judge/mentor owns Track 04? (Mentors listed include Monad Foundation AI team: `snubeaver`, `Jing`, `Jarrod Watts`, `pontus` from Corbits.)
3. Does the ERC-8004 Reputation Registry accept feedback from an arbitrary contract, or only from the client that transacted? (Determines if Claimless can write on behalf of others.)

## 9. Sources

| Source | Used for |
|---|---|
| `https://8004scan.io/api/v1/agents` | total agent counts, feedback fields (VERIFIED, live) |
| `https://8004scan.io/agents` | live UI feed showing Score 0 / Feedback 0 (VERIFIED) |
| `https://docs.monad.xyz/guides/erc-8004.md` | ERC-8004 contract addresses, registries (VERIFIED) |
| `Monad RPC eth_getCode` / `name()` | contract presence and name on mainnet vs testnet (VERIFIED) |
| `https://docs.monad.xyz/guides/x402.md` | facilitator flow, gasless payer, testnet USDC (VERIFIED) |
| `https://x402-facilitator.molandak.org/supported` | supported networks/schemes, signers (VERIFIED) |
| `https://monad.xyz/metropolis` | tracks, bounty list, judges (VERIFIED) |
| `https://docs.monad.xyz/tooling-and-infra/agentic-payments.md` | facilitator URL, MPP SDK (VERIFIED) |
