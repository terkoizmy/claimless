# Claimless — User Guide

> How an ordinary user actually uses Claimless, start to finish.
> Written 2026-09-21. Every command and address here is verified against the
> live deployment unless marked **(not yet published)**.

---

## 0. What Claimless is, from a user's point of view

Claimless is a **public record of AI-agent failures**, on-chain, plus a coverage
prototype priced off that record. In practice you use it for two things:

1. **Check an agent before you trust it.** "Has this agent ever failed, how
   badly, and is it hiding anything?" — one lookup, real data.
2. **Report an agent that failed you.** Post a staked, evidence-hashed report so
   the next person sees it. This is the behaviour the whole system is trying to
   make cheap.

There is no signup, no account, no API key for the read side. The data lives on
Monad testnet (chain 10143) and anyone can read it.

**Who does what:**

| You are… | You use… | Wallet |
|---|---|---|
| A user whose AI agent should check risk / report incidents | the **MCP server** (works inside Hermes and any MCP client) | the agent uses an agent wallet (or a local key on testnet) |
| A developer wiring tools into code | the **LangChain / Vercel adapter** or the **SDK** | same as above |
| Someone driving MetaMask's own agent CLI | the **`mm` plugin** | MetaMask Agent Wallet |
| An underwriter buying coverage | the **dashboard** + **Mera passkey** | Mera passkey (a passkey on your device) |

---

## 1. The 60-second version (read-only, no install, no wallet)

This is the fastest way to see the value: ask an agent to look up another agent.

Once the MCP server is connected (section 2), you just talk:

```
Is ERC-8004 agent 10182 safe to hire? Check its risk score and incident history.
```

The agent calls `get_agent_risk` and `list_incidents` and answers with live
values. On the current demo deployment agent **10182** returns score **87** with
one accepted incident, and agent **1867** returns **100** (clean).

You can also check with zero code, straight from a shell:

```bash
# risk score (87 = one severity-4 incident on record)
cast call 0xC839223ca14BFbe1DA4bC72e885eCe18caCed690 \
  "getScore(uint256)(uint256)" 10182 --rpc-url https://testnet-rpc.monad.xyz
```

---

## 2. Using Claimless inside Hermes (Nous Research)

Hermes Agent reads MCP servers from `~/.hermes/config.yaml` (the desktop app and
the CLI share the same file). Add a `mcp_servers` block and reload.

### 2a. Install the server

The server is `@terkoiz/claimless-mcp`. **It is not published to npm yet**
**(not yet published)** — until it is, run it from the repo you cloned:

```bash
git clone https://github.com/terkoizmy/claimless
cd claimless/mcp
npm install
npm run build
# now the launcher is: node /absolute/path/to/claimless/mcp/dist/index.js
```

Once published, the one-line form becomes:

```yaml
command: "npx"
args: ["-y", "@terkoiz/claimless-mcp"]
```

### 2b. Add it to Hermes — read-only first (recommended)

Start with the safe surface: the three read tools, no funds, no signer. This is
the right default because reporting (the write tool) spends money.

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  claimless:
    command: "node"
    args: ["/absolute/path/to/claimless/mcp/dist/index.js"]
    tools:
      include:
        - get_agent_identity
        - get_agent_risk
        - list_incidents
      prompts: false
      resources: false
```

Then reload and verify:

```bash
hermes mcp test claimless     # exits 0 when the server connects
```

or inside a session:

```
/reload-mcp
Tell me which MCP-backed tools are available right now.
```

You should see `get_agent_identity`, `get_agent_risk`, `list_incidents`.

### 2c. What the agent can now do

| Tool | Type | Ask it |
|---|---|---|
| `get_agent_identity` | read | "Who owns ERC-8004 agent 1867 and what wallet does it use?" |
| `get_agent_risk` | read | "What is agent 10182's risk score and does it have a disclosed record?" |
| `list_incidents` | read | "Show me every incident ever reported for agent 10182." |
| `report_incident` | **write** | "File an SLA_BREACH report against agent 10182." — spends MON |

---

## 3. How an agent "verifies" another agent (the real flow)

This is the core use case: **you are about to let agent B do paid work; you want
to know if it is trustworthy.** The honest answer is a disclosed history, not a
star rating.

```
You → Hermes: "Before I hire agent 10182 for this job, check it."
Hermes → get_agent_risk(10182)
        → score 87, acceptedCount 1, severitySum 4, ERC-8004 reputation summary
Hermes → list_incidents(10182)
        → id 0, SLA_BREACH, severity 4, status ACCEPTED, stake 0.01 MON
Hermes → answers you: "One accepted severe incident on record; score 87."
```

**How to read the result:**

| Signal | Meaning |
|---|---|
| `score` 100, **no** incidents | Clean, but also **silent**. On the coverage side a silent agent is priced at 5x and hard-capped, because "no record" is not the same as "no failures". |
| `score` < 100 with ACCEPTED incidents | **Disclosed** history. This is better than silence: the agent told the truth and the terms reflect it. |
| `status: PENDING` | Reported but the challenge window is still open. **Not yet a record** — the contract does not count it. |
| `status: CHALLENGED` / `REJECTED` | Someone disputed it. Check the outcome before trusting either side. |
| A Claimless summary in ERC-8004 | The same risk signal, published into the canonical registry so *any* ERC-8004 consumer can read it without touching Claimless at all. |

The key idea a user should internalise: **silence is priced, not punished.** An
agent with no history can still be used or covered — it just pays more and gets
less. That is the incentive to disclose.

---

## 4. Reporting an incident (the write path, spends money)

Reporting is how the record gets built. An agent (or you on its behalf) posts a
**staked** report: an evidence hash goes on-chain, the raw evidence stays
off-chain.

**Always dry-run first.** The tool defaults to `dry_run=true`, which validates
and quotes without sending anything:

```
Report an SLA breach by agent 10182, severity 3, but dry-run it first.
```

You get back the plan: `kindHash`, `evidenceHash`, `stakeWei`, `chainId` — and
nothing was sent.

To actually submit, the write tool needs a signer:

```yaml
mcp_servers:
  claimless:
    command: "node"
    args: ["/absolute/path/to/claimless/mcp/dist/index.js"]
    env:
      MONAD_PRIVATE_KEY: "0x..."     # a Monad testnet key funded with MON
    tools:
      include:
        [get_agent_identity, get_agent_risk, list_incidents, report_incident]
```

Then ask Hermes to file it with `dry_run` false. What happens on-chain:

1. The report is stored as `PENDING` with your **stake** as a bond
   (minimum `minStake()`, currently 0.01 MON).
2. A 3-day **challenge window** opens. Anyone can match your bond to dispute it.
3. Unchallenged, it finalises as `ACCEPTED` and the agent's score drops.
4. If challenged, the dispute is settled and **the winner takes both bonds**.

So the stake is a bond, not a fee. A false report can cost you the stake; that
is the anti-spam design. Full contract detail: `contracts/src/IncidentRegistry.sol`.

> **Safety note for a cautious user:** keep the write tool out of the Hermes
> `include` list until you actually want the agent spending money, exactly as
> the section 2b config does.

---

## 5. Other ways to use it (pick one)

### 5a. Inside code — LangChain or Vercel AI SDK

```bash
cd integrations/langchain && npm install && npm run build
```

```ts
import { claimlessLangChainTools } from "@claimless/langchain-tools/langchain";
// or: import { claimlessVercelTools } from "@claimless/langchain-tools/vercel";
```

Four tools with the same names; the write tool keeps its dry-run default.
Details: `integrations/langchain/README.md`.

### 5b. Inside MetaMask Agent Wallet (`mm`)

**(not yet published)** — install from the repo for now:

```bash
npm install -g @metamask/agent-wallet
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:/absolute/path/to/claimless/mm-plugin" --accept-permissions

mm claimless risk 10182     # live score + accepted incidents
mm claimless agent 10182    # ERC-8004 identity + reputation
mm claimless report 10182 SLA_BREACH 3 0x<32-byte-hash> 10000000000000000
```

Details: `mm-plugin/README.md`.

### 5c. Just look at it — the dashboard

```bash
cd web && npm run dev        # http://localhost:3000
```

Two pages: `/` (agent list, scores, the SILENT-vs-RECORD pricing contrast) and
`/coverage/` (pool capital, trigger status, the CRE forwarder). All live reads,
no mock data.

---

## 6. Mera: where do you actually get the passkey?

**Short answer: the passkey comes from *your device*, not from Mera.** There is
no Mera account to create, no Mera key to request, no signup page. Mera is a
library that turns a passkey you already own into a blockchain account.

### 6a. Where the passkey lives

When you "create a passkey", your operating system or browser stores it in the
platform authenticator:

| Your setup | Where the passkey is saved |
|---|---|
| **Desktop Chrome + Google account (sync ON)** | **Google Password Manager** (check `passwords.google.com`) |
| iPhone / iPad / Mac | iCloud Keychain |
| Windows (with Windows Hello) | Windows Hello / your Microsoft account |
| Android | Google Password Manager |
| A hardware key | the YubiKey itself |

Nothing extra is "obtained from Mera". At login, that authenticator runs a
WebAuthn ceremony and returns a **PRF output** (32 deterministic bytes). Mera
derives a normal Ethereum account from those bytes:

```
passkey PRF output (32B)
  → BIP-39 mnemonic → BIP-32 seed → m/44'/60'/0'/0/{index}
  → one or many ordinary EOAs
```

Lose the device, sign in on any synced device, and **the same address comes
back** — that reproducibility is the whole point. Nothing is stored on a server,
because there is no server.

### 6b. The #1 pitfall (read this before you conclude "it's broken")

On desktop Chrome, **only passkeys stored in Google Password Manager return PRF
output.** If Chrome saved the passkey to the local browser profile instead, Mera
throws `PRF_UNAVAILABLE`. The fix:

1. Chrome must be **signed into your Google account with sync ON**.
2. Serve the app over **HTTPS or `http://localhost`** (WebAuthn needs a secure context).
3. Let Chrome save the passkey into **Google Password Manager**, not "this device only".
4. Retry the ceremony.

### 6c. The 2-minute test (do this in the dashboard, no other site needed)

The dashboard ships a passkey page, so you can run the whole ceremony in one place:

1. `cd web && npm run dev`
2. Open **http://localhost:3000/passkey/** in **desktop Chrome**, signed into Google, sync ON.
3. Click **Create passkey + derive account**.
4. You should see the credential id, the **PRF output**, and a table of five derived addresses.

If it fails with `PRF_UNAVAILABLE`, the page prints the exact fix (the passkey was saved to
the local Chrome profile instead of Google Password Manager). Re-running with
**Sign in with an existing passkey** on any synced device must yield the **same address**.

There is also a zero-cost, no-code cross-check at **https://mera.category.xyz/demo**.

That browser ceremony is the exact step Claimless's own Mera integration was waiting on.
Everything around it is already tested: the derivation is pinned to the reference
`@scure/bip39` implementation by a known-answer test, and the full derivation/signing
path runs in Node (`cd sdk && npm test` → 10 passing, `npm run mera:demo`).

### 6d. Why a passkey and not just a wallet?

Because the two actors are different:

| Actor | Login | Why |
|---|---|---|
| **Human underwriter** | **Mera passkey** | needs a present human; device-bound; can't run headless |
| **Autonomous agent** | **Privy agent wallet** | must transact with no human present; key lives in a TEE |

A passkey cannot run headless, and an agent cannot tap a fingerprint prompt.
They are not competitors; they cover different actors.
See `docs/WALLET_DECISION.md`.

---

## 7. Honest status (what is and isn't ready)

| Piece | Status |
|---|---|
| On-chain contracts (5) | ✅ live on Monad testnet (chain 10143), addresses in `contracts/deployments/monad-testnet.json` |
| MCP server | ✅ works from the repo; ❌ **not yet on npm / MCP registry** |
| `mm` plugin | ✅ built + 24 unit tests; ❌ **not yet on npm**; no end-to-end `mm` run (CLI not installed) |
| LangChain / Vercel adapter | ✅ 17 tests pass against live RPC |
| Dashboard | ✅ live reads, builds clean |
| Mera | 🟡 code complete + node-verified; the browser PRF ceremony still needs a human |
| Demo video | ❌ not recorded (script: `docs/DEMO_SCRIPT.md`) |

## 8. Where to go next

| You want… | Read |
|---|---|
| The full agent story | `agents/README.md` |
| The MCP server | `mcp/README.md` |
| The MetaMask plugin | `mm-plugin/README.md` |
| The coverage/incentive design | `docs/INCENTIVE_MECHANISM_DESIGN.md` |
| Why the reporting layer is the gap | `docs/ERC8004_COLDSTART_FINDINGS.md` |
| The demo script | `docs/DEMO_SCRIPT.md` |
| Current repo state / handoff | `AGENTS.md` |
