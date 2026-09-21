# Claimless — Execution Plan & Handoff

> Version: 1.0 · Created: 2026-09-15
> **This document is a handoff for a new session.** Read this before starting.
> Submission deadline: **Oct 14, 2026, 03:59 UTC** · Remaining: **28 days**
> Repo: `C:\Users\terkoiz\Documents\hackathon\claimless` (separate from the `idea` docs folder)
> **New session? Read `AGENTS.md` first**, then section 0 and section 9 of this file.

---

## 0. Summary for a New Session

**What this is:** Claimless — an on-chain risk registry for AI agents plus a parametric coverage prototype.

**The problem:** AI agents fail and cause losses, but no loss data exists to price insurance. Armilla AI must verify each model manually. Nexus Mutual has no product for AI agents. Nobody is filling the data layer.

**The solution:** Three layers — (1) Incident Registry: agents report incidents on-chain with hash evidence + stake; (2) Risk Score: aggregation into a public score; (3) Parametric Coverage: payout triggered by measurable conditions, **not claims/voting**.

**Differentiation:** Zero human adjudication. The lesson from InsurAce, Cover Protocol, and Nexus Mutual (which surrendered to a 3-expert committee).

**Bounty target:** $26,500 (Aurora Intents $5k, Privy $5k, Nansen $5k, MetaMask Agent Wallet Plugin $2.5k, Mera ×2 $5k, CRE $3k, Envio $1k). Track 04.

**Working principles:**
1. **Commit every day** — a single commit on the final day means automatic disqualification
2. **Live data, not mocks** — a requirement of every bounty
3. **Working demo by end of week 3**, the rest is polish
4. **Verify sponsors before writing integration code**

---

## 1. Repo Structure (full skeleton)

```
claimless/
├── README.md                      # one-liner, architecture, how to test
├── AGENTS.md                      # conventions for coding agents (optional)
├── .gitignore
├── .env.example                   # env var list (no secrets)
│
├── contracts/                     # Foundry
│   ├── foundry.toml
│   ├── remappings.txt
│   ├── src/
│   │   ├── IncidentRegistry.sol   # report incident + stake
│   │   ├── RiskScore.sol          # aggregate → score per agent
│   │   ├── CoverPool.sol          # underwriter capital + premium
│   │   ├── ParametricTrigger.sol  # measurable condition → payout
│   │   └── AgentIdentity.sol      # ERC-8004 adapter (register + publish summary)
│   ├── test/
│   │   ├── IncidentRegistry.t.sol
│   │   ├── RiskScore.t.sol
│   │   ├── CoverPool.t.sol
│   │   ├── ParametricTrigger.t.sol
│   │   └── AgentIdentity.t.sol
│   ├── script/
│   │   └── Deploy.s.sol           # deploy to Monad testnet
│   └── deployments/
│       └── monad-testnet.json     # contract addresses after deploy
│
├── indexer/                       # Envio
│   ├── config.yaml                # events to index
│   ├── schema.graphql             # entity schema
│   ├── src/
│   │   └── EventHandlers.ts
│   ├── docker-compose.yaml        # Postgres + Hasura + indexer
│   └── README.md
│
├── sdk/                           # TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── registry.ts            # reportIncident, getIncidents
│       ├── risk.ts                # getRiskScore
│       ├── coverage.ts            # pool, trigger
│       ├── privy.ts               # Privy agent wallet integration
│       ├── mera.ts                # Mera passkey integration (humans)
│       ├── nansen.ts              # smart-money data
│       ├── intents.ts             # Aurora Intents any-chain deposits
│       ├── erc8004.ts             # read Identity/Reputation, publish summaries
│       └── envio.ts              # GraphQL queries
│
├── agents/                        # autonomous agent demos
│   ├── reporter.ts                # agent that reports incidents
│   └── README.md
│
├── mm-plugin/                     # MetaMask Agent Wallet plugin ($2,500 bounty)
│   ├── package.json               # oclif-plugin keyword + "mm" manifest block
│   ├── src/
│   │   ├── commands/
│   │   │   ├── claimless/report.ts    # claimless:report (wallet-submit)
│   │   │   ├── claimless/risk.ts      # claimless:risk   (wallet-read)
│   │   │   └── claimless/agent.ts     # claimless:agent  (wallet-read, ERC-8004)
│   │   └── index.ts
│   └── README.md
│
├── mcp/                           # MCP server — COLD-START DISTRIBUTION FIX
│   ├── package.json               # needs "mcpName" field for registry verification
│   ├── server.json                # Official MCP Registry manifest
│   ├── src/
│   │   ├── index.ts               # stdio transport
│   │   └── tools/
│   │       ├── identity.ts        # get_agent_identity
│   │       ├── risk.ts            # get_agent_risk
│   │       ├── incidents.ts       # list_incidents
│   │       └── report.ts          # report_incident (write)
│   └── README.md
│
├── integrations/                  # thin adapters over the same sdk/
│   └── langchain/                 # LangChain + Vercel AI tool definitions
│
├── web/                           # Next.js dashboard
│   ├── package.json
│   ├── app/
│   │   ├── page.tsx               # agent list + scores
│   │   ├── agents/[id]/page.tsx   # agent detail + incident history
│   │   └── coverage/page.tsx      # pool + trigger status
│   └── lib/
│
├── cre/                           # Chainlink CRE
│   ├── workflow/
│   │   └── trigger.ts             # check trigger → write on-chain
│   └── README.md
│
└── docs/
    ├── architecture.md            # diagram + explanation
    ├── sponsor-notes.md           # verification notes per sponsor
    ├── demo-script.md             # 2-3 minute demo scenario
    └── sponsor-feedback.md        # integration experience feedback (bounty requirement)
```

---

## 2. Daily Plan (28 days)

### Week 1 (Sep 15-21) — Foundation

| Day | Task | Deliverable | Gate |
|---|---|---|---|
| 1 | `git init`, folder structure, Foundry init | First commit | Repo works |
| 2 | Register Privy, Envio, Nansen, CRE. Test Mera passkey | `docs/sponsor-notes.md` | **Privy does not require a card** |
| 3 | `IncidentRegistry.sol` | Contract + basic tests | Report & read pass |
| 4 | Full `IncidentRegistry` tests + testnet deploy | Address in `deployments/` | Verified on explorer |
| 5 | `RiskScore.sol` | Aggregation + weighting | Score emerges from incidents |
| 6 | `RiskScore` tests + deploy | Contract address | Tests pass |
| 6b | `AgentIdentity.sol` (ERC-8004 adapter) + tests | Register + publish summary | Reads/writes canonical testnet registries |
| 7 | Envio indexer + Docker | GraphQL running locally | Data appears via query |

**Week 1 gate:** Contracts deployed, incidents can be reported & read, indexer running.

### Week 2 (Sep 22-28) — SDK & Integrations

| Day | Task | Deliverable | Gate |
|---|---|---|---|
| 8 | SDK: `registry.ts`, `index.ts` | Core functions | Can report via SDK |
| 9 | SDK: `privy.ts` (agent wallet) | Agent reports autonomously | No user interaction |
| 10 | SDK: `envio.ts` (GraphQL queries) | Data from indexer | Live, not mocked |
| 11 | SDK: `risk.ts` + cache/fallback | Score readable | Falls back to contract |
| 11b | SDK: `erc8004.ts` (read Identity, publish Reputation summary) | Agent registers + score published on-chain | Visible via 8004scan / `getSummary` |
| 12 | SDK: `mera.ts` (underwriter passkey) | Passkey login | **Google Password Manager** |
| 13 | SDK: `nansen.ts` (smart-money) | Additional signal | Beyond raw data |
| 14 | Aurora Intents: assets + `dry:true` quote + status tracker | `sdk/src/intents.ts` | Quote visible, no funds spent |
| 14b | Chainlink CRE workflow | `cre workflow simulate` | Free, no deploy needed |

**Week 2 gate:** End-to-end flow — agent reports → score forms → visible in UI.

### Week 3 (Sep 29 - Oct 5) — Coverage & Demo

| Day | Task | Deliverable | Gate |
|---|---|---|---|
| 15 | `CoverPool.sol` | Capital + premium | Underwriter can deposit |
| 16 | `ParametricTrigger.sol` + tests | Trigger → payout | Pass/fail scenarios pass |
| 17 | Dashboard: agent list + scores | Main page | Live data |
| 18 | Dashboard: agent detail + coverage | 2 pages | Navigation works |
| 18b | Wire Aurora Intents quote into "Deposit from any chain" UI | Deposit panel | Any-chain deposit visible |
| 19 | End-to-end demo v1 | Full scenario | 8 steps work |
| 19b | MetaMask Agent Wallet plugin (`mm claimless report/risk/agent`) | Published npm package | `mm plugins install` works on Monad testnet |
| 19c | **MCP server published to npm + Official MCP Registry** | `npx -y @scope/claimless-mcp` | Registry search finds it |
| 19d | LangChain + Vercel AI adapters over the same SDK | Importable tools | Example agent uses one |
| 20 | Demo polish + bug fixes | Stable demo | Repeatable |
| 21 | Record 2-3 minute video | `docs/demo-script.md` + video | Video done |

**Week 3 gate:** Demo runs fully and has been recorded.

### Week 4 (Oct 6-14) — Polish & Submit

| Day | Task | Deliverable | Gate |
|---|---|---|---|
| 22 | Full README | One-liner, architecture, how to test | Others can follow it |
| 23 | `docs/architecture.md` + sponsor feedback | Documentation | Bounty requirements met |
| 24 | Edge cases (false reports, insufficient stake) | Bugs fixed | No crashes |
| 25 | Edge cases (trigger not met, refund) | Bugs fixed | Correct behavior |
| 26 | Fill submission form, choose track & bounties | Submission sent | Confirmed |
| 27 | Buffer | — | — |
| 28 | **Final submission before 03:59 UTC** | Done | Confirmed |

---

## 3. Contracts: Function Specifications

### IncidentRegistry.sol
```solidity
// Report an incident. Reporter must stake.
function reportIncident(
    uint256 agentId,
    bytes32 kind,        // e.g. keccak256("SLA_BREACH")
    uint8 severity,      // 1-5
    bytes32 evidenceHash // keccak256(input||output), payload on IPFS
) external payable;

// Reads
function getIncidents(uint256 agentId) external view returns (Incident[] memory);
function getIncidentCount(uint256 agentId) external view returns (uint256);

// Anti-spam staking (optimistic: silence of the accused = report stands)
function challenge(uint256 incidentId) external payable;  // match the reporter's bond
function resolveChallenge(uint256 incidentId, bool reportStands) external;  // loser forfeits bond
function finalize(uint256 incidentId) external;           // after window, unopposed report is accepted
uint256 public constant CHALLENGE_WINDOW = 3 days;
event IncidentReported(uint256 indexed agentId, uint256 indexed incidentId, bytes32 kind, uint8 severity, address reporter);
event IncidentChallenged(uint256 indexed incidentId, address challenger);
event IncidentFinalized(uint256 indexed incidentId, bool accepted);
```

**Incentive design (see `docs/INCENTIVE_MECHANISM_DESIGN.md`):** staking here is **only** for disputes — it makes *false* reports expensive. It does **not** make silence expensive. That job belongs to `CoverPool` below.

### RiskScore.sol
```solidity
function getScore(uint256 agentId) external view returns (uint256);      // 0-100
function recompute(uint256 agentId) external;                            // re-run aggregation
event ScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);
```

### CoverPool.sol
```solidity
function deposit() external payable;                    // underwriter deposits capital
function withdraw(uint256 amount) external;

// PRIMARY INCENTIVE MECHANISM: disclosure is a condition of coverage.
// DECIDED: never a hard rejection. No record => punitive premium + hard-capped small coverage.
function buyCover(uint256 agentId, uint256 amount, uint256 duration) external payable;
function quotePremium(uint256 agentId, uint256 amount, uint256 duration)
    external view returns (uint256 premium, uint256 maxCoverage, bool hasRecord);
function getCapacity() external view returns (uint256);
uint256 public constant NO_RECORD_PREMIUM_MULTIPLIER = 5;      // 5x the best tier
uint256 public constant NO_RECORD_MAX_COVERAGE_BPS = 1000;     // 10% of normal cap
event CoverPurchased(uint256 indexed agentId, address buyer, uint256 amount, uint256 premium);
event CoverRefused(uint256 indexed agentId, address buyer, bytes32 reason); // only for invalid cases, NOT for missing data
```

**This is the cold-start fix.** A new agent **can** buy coverage, but at 5x premium and 10% of the normal cap. Reporting an incident (or completing a coverage period) improves the terms. Silence is priced, not punished. Proven pattern: Sherlock Shield prices coverage by disclosed findings (0 findings = $500k, 30+ = $1k).

### ParametricTrigger.sol
```solidity
// A trigger is registered per coverage. Payout is automatic when the condition is met.
function registerTrigger(uint256 coverageId, bytes32 condition, uint256 threshold) external;
function evaluate(uint256 coverageId) external returns (bool);   // called by CRE
function payout(uint256 coverageId) external;                    // automatic, no voting
event TriggerEvaluated(uint256 indexed coverageId, bool met);
event PayoutExecuted(uint256 indexed coverageId, uint256 amount);
```

**Critical rule:** `payout()` **must not** require human approval, voting, or a committee. If it does, we repeat the Nexus Mutual mistake.

### AgentIdentity.sol (ERC-8004 adapter — CORE COMPONENT)

ERC-8004 is the standard Track 04 names, and it is **already deployed on Monad testnet**. We do not fork it; we write into it.

```solidity
// Wraps the canonical ERC-8004 registries. Registry address is a constructor arg
// so the same contract works on testnet and mainnet.
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function ownerOf(uint256 agentId) external view returns (address);
}
interface IReputationRegistry {
    function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals,
                          string calldata tag1, string calldata tag2,
                          string calldata endpoint, string calldata feedbackURI,
                          bytes32 feedbackHash) external;
    function getSummary(uint256 agentId, address[] calldata clients,
                        string calldata tag1, string calldata tag2)
        external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
}

// Claimless functions
function registerAgent(string calldata agentURI) external returns (uint256 agentId);
function publishRiskSummary(uint256 agentId) external;   // aggregate Incidents → giveFeedback
function getAgentRisk(uint256 agentId) external view returns (int128 score, uint8 decimals);
```

**Design rules:**
- **Never** rate our own agent's incident (ERC-8004 blocks self-feedback anyway).
- `tag1` should be a fixed taxonomy string, e.g. `"claimless:incident"`, so consumers can filter.
- Push a **summary**, not raw events, into Reputation. Rich data stays in `IncidentRegistry`.
- Make registry addresses configurable per network; do **not** hardcode.
- Interfaces are hand-written in `contracts/src/interfaces/` from the **official upstream ABIs** saved in `contracts/abis/`. Do not guess signatures. (Corrected: `getSummary` returns `uint64 count`, not `uint256`.)

**Addresses (VERIFIED on-chain):**

| Network | IdentityRegistry | ReputationRegistry |
|---|---|---|
| Monad testnet (10143) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Monad mainnet (143) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

**Why this is a differentiator, not decoration:** ERC-8004 has **1,821 agents on Monad testnet and essentially zero feedback** (verified). Everyone else stops at registration. We are the layer that actually populates reputation, with staked evidence behind it.

---


## 4. Demo Scenario (2-3 minutes)

1. Open the dashboard — agent list + risk scores
2. Underwriter logs in with a **Mera passkey** (no seed phrase, no extension)
3. An **autonomous agent** reports an incident using a **Privy agent wallet** (no user interaction)
4. Risk score drops — real-time from **Envio**
5. Underwriter buys coverage for that agent
6. Trigger fires (SLA deliberately breached)
7. **Chainlink CRE** detects it → automatic payout
8. Show that: **no voting, no committee, no human adjudication**

---

## 5. Bounty Map

| Bounty | Value | How to qualify |
|---|---|---|
| **Bring Any-Chain Liquidity to Monad** (Aurora Intents) | $5,000 | Any-chain deposits/swaps into the Monad app via Intents Deposits |
| **Privy!** | $5,000 | Agent wallet (not just login) + policy engine |
| **Best use of Nansen** | $5,000 | Score enriched with smart-money data (beyond raw) |
| **Best Mera-Powered UX** | $2,500 | Mera is the **entire** account layer for underwriters |
| **Mera: One Passkey, Many Keys** | $2,500 | Many accounts derived from one passkey |
| **Best workflow with CRE** | $3,000 | CRE as the trigger orchestration layer |
| **Best Use of Envio** | $1,000 | Indexer drives a core feature |
| **Best Agent Wallet Plugin** — *sponsor: MetaMask* | $2,500 | Published `mm` plugin; Monad testnet 10143 is natively supported |
| **Total** | **$26,500** | |

> **Agent Wallet Plugin — verified facts** (details in `docs/METAMASK_AGENT_WALLET_PLUGIN.md`):
> - Sponsor is **MetaMask**; deliverable is an **npm package** adding `mm` commands.
> - **Monad testnet (10143) and mainnet (143) are both preconfigured** in Agent Wallet. No workaround needed.
> - Capabilities we use: `wallet-read` + `wallet-submit`. `mnemonic-read`/`config-write` are reserved and rejected.
> - Plugins are **beta and off by default**: judges need `mm config set experimentalPlugins true`.
> - Cost: **$0**. Template + SDK are free; `@metamask/agent-wallet` latest is 6.2.1.
> - **This also mitigates our cold start:** if `mm claimless report` is one command away, reporting stops requiring custom integration.

> **Track 04 target:** "Trust, Identity & AI Infrastructure" — $30,000 split across 3 teams. It explicitly lists **"Agent identity and reputation under ERC-8004"**. We now write into ERC-8004's live Monad registries rather than compete with them.

### Aurora Intents integration (bounty-critical facts, VERIFIED 2026-09-15)

- **Aurora Intents has no testnet** and none is planned (verbatim: *"no testnet deployment and no plans for one"*). Do **not** spend time searching for one.
- **But the rest of the app CAN run full testnet with no dry-run:** Monad testnet (10143) + Circle testnet USDC. See the hybrid below.
- Demo the Aurora leg with `dry: true` quotes: **zero funds, zero gas**. This alone satisfies the integration requirement.
- No documented minimum swap. Live quotes confirmed down to **$0.20-0.50**.
- Optional live proof costs **$0.50 USDC on Base** + ~$0.001 gas. Real tx hash = much stronger evidence.
- **Use Base, not Ethereum mainnet.** Base gas is ~20x cheaper and effectively free; mainnet gas can spike and strand a sub-$1 balance.
- Endpoint: `POST https://1click.chaindefuser.com/v0/quote` (works without an API key for `dry: true`).
- Destination asset for Monad USDC: `nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx`
- Base USDC origin: `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`

### Demo rails: hybrid testnet + mainnet (recommended)

| Layer | Rail | Testnet? |
|---|---|---|
| Contracts + pool deposits + triggers | Monad testnet (10143) + Circle testnet USDC | ✅ Fully testnet, no `dry` |
| Aurora Intents any-chain deposit leg | NEAR Intents mainnet (no testnet exists) | ❌ Quote via `dry:true`, optional $0.50 live proof |

**Monad testnet USDC (Circle):** `0x534b2f3A21130d7a60830c2Df862319e593943A3` (VERIFIED on-chain: `symbol() == "USDC"`).
Faucets: `faucet.monad.xyz` for gas, `faucet.circle.com` for USDC.

**Caveat:** Monad testnet was reset from genesis on 2025-12-16 and canonical contracts get redeployed. Fetch the USDC address at build time; add a startup bytecode check that fails loudly if the contract is missing.

**CRITICAL — faucet USDC cannot be used with Aurora (VERIFIED):** testnet assets are **absent from the Intents registry by design** (no solver liquidity for valueless tokens). Verified: neither Monad testnet USDC (`0x534b2f3A...`) nor NEAR testnet USDC (`3e2210e1...`) appears among the 189 registry assets, and no `testnet` appears in any `blockchain` or `assetId`. `originAsset`/`destinationAsset` must be registry IDs, so there is no workaround. Every submitter faces this: Aurora simply cannot run on a faucet. Do not waste time trying.

**No Aurora-chain balance is ever needed (VERIFIED):** "Aurora Intents" is a routing layer on NEAR Intents, **not a chain we fund**. Our route is `Base USDC → router → Monad USDC`; the Aurora chain never appears. The registry has 35 distinct chains and **no `aurora` chain at all**. Aurora's fees are deducted from the routed amount, not billed to an account. Only money needed: value + gas on the **origin** chain (Base), and only for the optional live proof.

---

## 6. Pre-Coding Checklist

- [ ] `git init` in the repo folder
- [ ] Foundry installed (`forge --version`)
- [ ] Node v22+ (Envio requirement)
- [ ] Docker Desktop running (already verified)
- [ ] Register Privy → **check whether a card is required**
- [ ] Register Envio → get `ENVIO_API_TOKEN`
- [ ] Register Nansen → get API key
- [ ] Install Chainlink CRE CLI
- [ ] Test passkey at `mera.category.xyz/demo` → **use Google Password Manager**
- [ ] Register Aurora Intents at `studio.aurora.dev` (optional; `dry:true` quote needs no key)

---

## 7. Contingency Plans

| Risk | Fallback |
|---|---|
| Privy requires a credit card | Still use it (free tier is $0). If impossible → Dynamic (adjust MAU) |
| Mera `PRF_UNAVAILABLE` | Ensure passkey is in Google Password Manager; test on Day 2 |
| Envio/Docker problems | Use Envio Cloud free tier |
| CRE deploy needs approval | Free simulation is enough for the demo |
| Running out of time | Priority: contracts + score + demo. Dashboard can be minimal |
| Passkey fails during demo | Prepare a fallback account (mnemonic import) |

---

## 8. Non-Negotiable Rules

1. ❌ Never call it "insurance" — no license. Call it a "risk registry + coverage prototype"
2. ❌ No claim voting/committees — the lesson from Nexus Mutual & InsurAce
3. ❌ No ZK/zkML — our triggers are deterministic, not semantic
4. ❌ No mocked data — every bounty requires live on-chain data
5. ❌ No single commit at the end — automatic disqualification
6. ❌ Never use Privy + Dynamic together — direct competitors, looks forced

---

## 9. Research Context (MUST READ — this document is self-contained)

> This document is designed to **stand alone**. If you only receive `IDEA.md` and `PLAN.md`, everything you need is here.

### 9.1 Why not copy existing DeFi insurance

Verified research shows the DeFi insurance category is **small and littered with failures**:

| Protocol | Status |
|---|---|
| **InsurAce** | **Dead** — TVL $143K, staked $0 |
| **Cover Protocol** | **Shut down** Dec 2021 |
| **Cozy Finance** | Alive, but rebranded to "DeFi Safety Stack" |
| **Nexus Mutual** | Alive, has paid out $18.5M in claims |
| **Entire category** | Only **~$122M TVL**, no big winner |

**Root cause: discretionary claim adjudication.**
- Nexus Mutual rejected most 2020-2021 claims (MakerDAO "Black Thursday", Bancor $1M, Anchor)
- They tried token voting (V1) → stake-weighted (V2) → **surrendered to 3 human experts** (V3, Nov 2025)
- **Lesson: no voting, no committees. Payout must be parametric.**

### 9.2 Why the market is real (not hypothetical)

| Evidence | Data |
|---|---|
| Zillow Offers (2021) | Lost **$420M**, business shut down |
| Air Canada chatbot (2024) | Lost in court; "the bot is responsible" defense rejected |
| AI Incident Database | Hundreds of documented incidents, unstructured |
| Agentic AI in insurance market | $368M (2025) → **$5.07B (2032)**, CAGR 44% |
| Armilla AI | **Lloyd's** Coverholder, backed by Chaucer/Axis/Convex/Swiss Re |
| AI adoption | **78% of organizations** (Stanford AI Index 2025) |
| Regulation | EU AI Act + Colorado AI Act **mandate incident reporting** |

### 9.3 Patterns that demonstrably win (copy these)

1. **Assessment → Coverage.** Sherlock and Armilla both make verification a **prerequisite** for coverage.
2. **Parametric payout.** Sherlock Shield sizes cover from a score: 0 findings → **$500k cover**, more findings means less ($250k → $1,000). **Measurable, not discretionary.**

### 9.4 Competitors & our position

| Player | What they do | What they **do not** do |
|---|---|---|
| **x402** | Agent payment rail (75M tx/30 days), **zero fee** | Does not know whether the work is correct |
| **ERC-8004** | Identity/reputation/validation registries (hooks) | Provides hooks, **not validators** |
| **Nevermined** | Agent budget & mandate (fiat-first, 1-2% fee) | Does not validate work outcomes |
| **Armilla AI** | AI insurance backed by Lloyd's | **Manual per-model** verification, does not scale |
| **Nexus Mutual** | On-chain insurance | **A 3-person committee** decides claims |

**The gap we fill:** nobody provides **AI agent loss data**. Without it, nobody can price a premium.

### 9.5 Key technical findings (do not re-research these)

**Mera** (passkey for humans):
- Built by **Category Labs** (not Monad Foundation). Repo: `github.com/category-labs/mera`
- Apache-2.0/MIT license, **no API key, no server, no custody**
- Accounts are regular EOAs; nothing needs deploying
- ⚠️ **Pitfall:** on desktop Chrome, **only passkeys in Google Password Manager** return PRF. If Chrome saves to the local profile, mera throws `PRF_UNAVAILABLE`. **This is the most common setup failure.**
- Requires HTTPS or localhost

**Envio** (indexer):
- **Self-hostable via Docker.** Example repo: `enviodev/local-docker-example`
- 3 services: `postgres:17.5`, `hasura/graphql-engine:v2.43.0`, `envio-indexer`
- Requires `ENVIO_API_TOKEN` (free from `envio.dev/app/api-tokens`) for HyperSync
- Alternative: use your own RPC = **100% token-free**
- Monad verified (mainnet 143, testnet 10143)
- ⚠️ Requires **Node v22+** and **Docker**

**Nansen**:
- Free plan: **100 credits**, refills 10/day, 15 req/s
- CLI: `npm i -g nansen-cli`, MCP: `npx skills add nansen-ai/nansen-cli`
- Monad verified

**Chainlink CRE**:
- **Free to build + simulate.** Deploy requires approval (`cre account access`)
- **No LINK token required** (LINK is only for classic oracle services)
- `--broadcast` requires testnet native tokens from `faucets.chain.link` (free)
- Monad testnet supported (CLI ≥ v1.30.0)

**Privy** (agent wallet):
- Free: 0-499 MAU + **50,000 free signatures/month**
- Agent-owned wallets: keys live in a **TEE**; the agent gets an **ephemeral signing key** (the private key is never exposed to the agent process)
- Policy engine (caps, allowlists) **included in the free tier**
- x402 + MPP built in
- Monad: compatible (configure via `supportedChains`/`defaultChain`)
- ⚠️ **Unverified:** whether signup requires a credit card

**What we do NOT use:**
- **Cleanverse** — docs gated behind an invitation code, requires company KYC. Not worth $2k
- **Dynamic** — loses to Privy (unless a MAU test proves otherwise)
- **KIMI** — not free (requires a $1 minimum top-up)

### 9.6 Supporting documents (OPTIONAL)

If available, these give extra detail. **Not required** — §9 already summarizes what matters:

| Document | Contents |
|---|---|
| `CLAIMLESS_DEEPDIVE.md` | 6 real business models, full competitor analysis |
| `AGENT_INSURANCE_RESEARCH.md` | Detailed Nexus/Sherlock/Armilla mechanics |
| `WALLET_DECISION.md` | Privy vs Dynamic comparison |
| `BOUNTY_STRATEGY.md` | All bounties + cluster stacking |
| `SPONSOR_FEASIBILITY.md` | Free-tier feasibility per sponsor |

---

## 10. Instructions for a New Session

If you are an agent newly opened to work on this project:

### First steps
1. **Read `IDEA.md` and this `PLAN.md` to the end.**
2. Check the current position: `git log --oneline` and see which week gate has passed.
3. Work on the **next day** according to the table in §2.

### How to report back to the user
After reading, report your understanding in this format:
```
UNDERSTANDING:
- Project: Claimless — [1 sentence]
- Problem: [1 sentence]
- Solution: [3 layers]
- Differentiation: [1 sentence]
- Stack: [technology + role]

CURRENT POSITION:
- Last gate passed: [week N / none yet]
- Next day: [N]

PLAN:
- [first 3 actions]
- Questions/blockers: [if any]
```

### Working rules
1. **Commit after each completed task.** Do not batch them.
2. **Live data, not mocks.**
3. **Verify sponsors before writing integration code** (§6 checklist).
4. If you need parallelism, use swarm — but make sure the **repo is already `git init`** so cross-agent conflict notifications are active.
5. If unsure about a design decision, check §9 (research context) before asking.

### Already-answered questions (do not ask again)
- Why not regular insurance? → §9.1 and `IDEA.md` §4
- Why not ZK? → our triggers are deterministic, not semantic
- Why Privy, not Dynamic? → §9.5
- Why is Cleanverse not used? → §9.5
- Which track? → Track 04 (Trust, Identity & AI Infrastructure)

---

## 11. How to Work with Swarm

This project is **designed to be built in parallel using swarm**. This section covers configuration and patterns.

### 11.1 Prerequisites (MANDATORY)

```bash
cd claimless
git init
git add -A
git commit -m "chore: handoff docs (IDEA.md, PLAN.md)"
```

**Why `git init` is mandatory before swarm:** jcode only enables cross-agent conflict notifications (agent A edits a file agent B has already read) when agents run **in the same git repo**. Without it, two agents can silently overwrite each other's files.

### 11.2 Pre-configured jcode settings

`~/.jcode/config.toml` is already set up for comfortable swarm work:

```toml
[agents]
swarm_spawn_mode = "visible"      # agents appear as real panes
swarm_strip_layout = "vertical"
swarm_max_concurrent_agents = 32

[terminal]
spawn_hook = "wt -w 0 sp -V"      # vertical split pane in Windows Terminal
```

**Effect:** every agent spawned with `spawn_mode: visible` appears as a **new pane on the right** of the Windows Terminal window. You can watch them work while continuing to read the main conversation in the left pane.

### 11.3 Model for workers

Default worker model (decided 2026-09-15): **`ollama-cloud:glm-5.3-flash`** (route-pinned) with `effort="low"` for defined coding/verification tasks.

```
model: "ollama-cloud:glm-5.3-flash"
```

⚠️ **Name note:** the old names in earlier drafts were wrong.
- `deepseek-v4-flash:cloud` — **does not exist**
- `deepseek-v4-flash:0731-cloud` — **does not exist** (this was the previous "correct" name and it is also wrong)
- Valid ids instead: `deepseek-v4-flash:0731` and `deepseek-v4.1-flash:cloud` (coordinator default)

Run `swarm list_models` to confirm what is actually available before spawning.

### 11.4 Spawn pattern that works

**Always include these three things:**

```
swarm(
  action="spawn",
  label="short-task-name",           # MANDATORY, shown in the UI
  model="ollama-cloud:glm-5.3-flash",
  spawn_mode="visible",               # MANDATORY for panes
  effort="low",                       # research: low | coding: low | review: default
  prompt="[detailed task, see §11.6]"
)
```

**Mistake that has happened:** forgetting `spawn_mode: "visible"` → the agent runs headless and is invisible even though `swarm_spawn_mode = "visible"` is already in the config. **The per-call parameter overrides the config.**

### 11.5 When to use swarm (and when not to)

| Situation | Swarm? | Reason |
|---|---|---|
| Parallel web research (3 sponsors at once) | ✅ Yes | Independent, no waiting on each other |
| Scaffolding several different files | ✅ Yes | Separate files, safe |
| Writing 4 contracts (Registry, Score, Pool, Trigger) | ✅ Yes | Separate files |
| Writing one contract with many functions | ❌ No | File conflicts; serialize instead |
| Debugging a single error | ❌ No | Needs focus, not parallelism |
| Reviewing/verifying results | ✅ Yes | Different perspectives help |
| Documentation (README, architecture.md) | ✅ Yes | Different files |

**Rule of thumb:** one agent = one primary file. If two agents touch the same file, serialize them.

### 11.6 Good prompt templates

A prompt that works must contain:

1. **A specific task** — not "do week 1"
2. **The files it touches** — so the agent knows its boundary
3. **Definition of done** — how the agent knows it is finished
4. **Prohibitions** — what it must not do
5. **Limits** — webfetch count, files not to edit

**Contract prompt example:**
```
Implement contracts/src/IncidentRegistry.sol per the spec in PLAN.md §3.

Requirements:
- Foundry, Solidity ^0.8.20
- Functions: reportIncident(agentId, kind, severity, evidenceHash) payable,
  getIncidents(agentId), getIncidentCount(agentId), challenge(incidentId)
- Event: IncidentReported(agentId, incidentId, kind, severity, reporter)
- Anti-spam stake: reject if msg.value < minimum
- Also write tests in contracts/test/IncidentRegistry.t.sol

Definition of done: `forge test` passes all tests.
Prohibited: do not touch other files. Do not deploy yet.
When done, report: files created, forge test result, commit hash.
```

**Research prompt example:**
```
Web research (websearch works on this machine; webfetch concrete URLs for primary sources).
TOPIC: [topic]
[list of concrete URLs to check]
Report: [requested points]
Include a source URL per claim. Mark VERIFIED vs UNCERTAIN.
Max 12 webfetch. Do not edit files.
```

### 11.7 Suggested swarm pattern per week

**Week 1 (Foundation):**
```
Day 1: manual (git init + folder structure)
Day 3-4: spawn 1 agent for IncidentRegistry + 1 for tests
Day 5-6: spawn 1 agent for RiskScore + 1 for tests
Day 7:  manual (Envio Docker, needs interactive debugging)
```

**Week 2 (SDK):**
```
Day 8-9:   spawn 1 agent for the SDK core (registry.ts, index.ts)
Day 10-11: spawn 1 agent for envio.ts + 1 for risk.ts
Day 12-14: spawn 1 agent per integration (privy.ts, mera.ts, nansen.ts)
```

**Week 3-4:**
```
Dashboard: spawn 1 agent per page (3 pages = 3 agents)
Docs: spawn 1 agent for README, 1 for architecture.md
Review: spawn 1 agent for final verification
```

### 11.8 Correct swarm flow

```
1. spawn(label, model, spawn_mode="visible", prompt)
2. await_members()          # wait for completion (runs in background)
3. [receive the report automatically]
4. swarm list               # check status
5. swarm cleanup            # MANDATORY: clean up workers when done
```

⚠️ **Always clean up.** Accumulated workers drain server memory (see the `runaway_live_session_population` incident in jcode docs).

### 11.9 If a worker gets stuck

Signs: running >5 minutes with no progress, or `Progress: 0/N todos` frozen.

**Action:**
1. Send a message: `swarm message` → "Report NOW with whatever you have, bullet points only."
2. Wait 1-2 minutes.
3. If still stuck: `swarm stop <name>`, then do it yourself.

**Lesson from an earlier research session:** 2 out of 5 workers failed or got stuck. **Always have a plan to do the work yourself.**

### 11.10 Swarm checklist

- [ ] Repo is `git init`'d with a first commit
- [ ] Config has `swarm_spawn_mode = "visible"` + `spawn_hook = "wt -w 0 sp -V"`
- [ ] Every spawn includes `label` + `model` + `spawn_mode="visible"`
- [ ] Prompt states file boundaries (one agent = one primary file)
- [ ] `await_members` called before moving on
- [ ] `swarm cleanup` called when done

### 11.11 Lessons learned (2026-09-21, first parallel build session)

**What worked.** Three workers ran concurrently on genuinely disjoint directories (`web/`, `mcp/`, `mm-plugin/`) with no file conflicts. The rule "one agent = one primary directory" held.

**Non-obvious requirements for the prompt.** Each of these was learned by leaving it out:

1. **State the WHY, not just the what.** A prompt that says "build an MCP server" produces generic
   scaffolding. A prompt that says "828k agents registered and ~0 feedback, so the point is removing
   the integration barrier" produced tools shaped around the actual problem. Include the research
   context or expect filler.

2. **Name the reference implementation if one exists.** For `mm-plugin`, pointing at an already-cloned
   official template (`%TEMP%\_mmtpl`) meant the worker copied the authoritative structure instead of
   inventing one. Clone the template first, then spawn.

3. **Forbid mock data explicitly.** Without it, a worker will happily render fake numbers when an RPC
   read fails, which is worse than an error message in a project whose whole claim is "live data,
   not mocks". Say: if you cannot read it, show the failure.

4. **Require self-verification with the real output.** "Build succeeds" is not done. Ask for the exact
   command output and the values actually observed. A worker that only compiled, never ran, has not
   finished.

5. **Prohibit writing an install you cannot do.** `mm-plugin` cannot be end-to-end tested without the
   `mm` CLI. Telling the worker up front to say so plainly, rather than claim a live run, produced an
   honest report instead of a fabricated one.

6. **Forbid editing outside the assigned directory, by name.** List the sibling directories that are
   off-limits. "Do not touch other files" is too vague.

**Prompt template that incorporates all six:**

```
<one-sentence task>

READ FIRST: <docs and any template/reference path>
WORKDIR: <repo root>
YOUR SCOPE: ONLY <dir>. You own every file under it. Do NOT edit anything outside <dir>.

WHY THIS EXISTS: <the research finding or user need that motivates it>

VERIFIED FACTS (do not re-research): <facts already established>

BUILD THESE <N> THINGS (exactly these, no more): <numbered list>

DEFINITION OF DONE
- <build command> succeeds.
- VERIFY IT YOURSELF: <how to exercise it for real>, then report the actual output.
  A build that compiles but was never executed is not done.
- Report: files created, build output, and what you did and did not verify.

PROHIBITED
- Do NOT edit anything outside <dir>.
- Do NOT modify <explicit list of sibling dirs>.
- Do NOT create mock/fixture data.
- Do NOT commit. Leave the working tree dirty; the coordinator commits.

LIMITS: <what they may run>; do not run `forge`; do not touch git.
```

**Still true from the earlier session:** workers can stall or drift (one wrote seven stray `probe*.js`
files that had to be deleted, and another burned minutes scanning 105M blocks with `eth_getLogs`
before being stopped). Always keep a plan to finish the work yourself, and check for stray artifacts
after cleanup.

