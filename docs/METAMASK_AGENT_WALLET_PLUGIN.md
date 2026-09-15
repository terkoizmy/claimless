# MetaMask Agent Wallet Plugin — Claimless Integration Plan (VERIFIED 2026-09-15)

> Bounty target: **"Best Agent Wallet Plugin" — $2,500, sponsored by MetaMask**.
> Goal: turn Claimless from an API that agents *could* call into a **command agents have installed**, so reporting an incident is one line in an agent's natural-language prompt.

## 0. Why this matters (connect to the cold-start problem)

Our own verified measurement (`ERC8004_COLDSTART_FINDINGS.md`) says registration is solved and *reporting* is not: 827,827 agents, ~0 feedback. The cause is that reporting is optional, unpunished, and requires custom integration.

A plugin attacks the third cause directly. If `mm claimless report` exists, an agent reports an incident the same way it swaps tokens or checks a balance. **Distribution is a cold-start remedy, not a nice-to-have.**

## 1. What the bounty actually is

From MetaMask's own docs and the Monad announcement (VERIFIED):

- Sponsor: **MetaMask**. Amount: **$2,500**.
- Monad's announcement wording: *"Builders can win bounty prizes from: @Metamask: Best agent wallet plugin"*.
- MetaMask Agent Wallet has a **first-class plugin system**: "Plugins extend MetaMask Agent Wallet with custom commands. A plugin is an npm package that adds native commands, discoverable in `mm help` and the REPL."
- The documented example plugins include `mm ens resolve` and `mm x402`.

So the deliverable is a **published npm package** that adds `mm` commands. Not a fork, not a fork of MetaMask.

## 2. Monad support — the critical feasibility fact

| Network | Chain ID | Status |
|---|---|---|
| **Monad Testnet** | **10143** | ✅ **Preconfigured** (listed explicitly in testnets) |
| **Monad Mainnet** | **143** | ✅ Preconfigured, and **Transaction Shield "Covered"** |

Source: `docs.metamask.io/agent-wallet/reference/supported-chains/` (VERIFIED).

**This is the decisive fact:** MetaMask Agent Wallet already supports the exact chain we build on, on both testnet and mainnet. No workaround needed.

## 3. Cost: zero

| Item | Cost |
|---|---|
| Node.js v22+ | already installed (v24.16.0) |
| Plugin template | free (GitHub, public) |
| `@metamask/agent-wallet` SDK | free on npm (latest **6.2.1**) |
| Local install & test | free |
| Monad testnet gas | free (`faucet.monad.xyz`) |
| npm publish | free (public package) |

**Total: $0.** Fully compatible with the no-money rule.

## 4. How the plugin works (from the reference docs)

### 4.1 It is an oclif plugin

`package.json` must declare:
- the `oclif-plugin` keyword,
- a `@metamask/agent-wallet` **peer** dependency (not a regular one — the host symlinks itself in),
- an `oclif` block pointing at compiled commands,
- a generated `oclif.manifest.json`,
- plus an `mm` block describing commands and capabilities.

`oclif.hooks` and `oclif.plugins` are **rejected** (hooks would run outside the plugin boundary).

### 4.2 Manifest shape

```json
"mm": {
  "schemaVersion": 1,
  "minCliVersion": "^6.2.0",
  "capabilities": [],
  "commands": [
    {
      "id": "claimless:report",
      "capabilities": ["wallet-submit"],
      "dataAccess": ["balances"],
      "targetChains": [10143]
    }
  ]
}
```

### 4.3 Capabilities we need

| Capability | Grants | Do we need it? |
|---|---|---|
| `wallet-read` | `ctx.publicClient(chainId)` (authenticated viem client), account/price/token/fee services | ✅ yes, to read risk scores and agent state |
| `wallet-submit` | `ctx.walletExecutor(io, id)` for transactions, message signing, EIP-712 typed data — still policy-gated by MetaMask | ✅ yes, to submit `reportIncident` |
| `network-manage` | `ctx.networkRegistry` | ❌ not needed |

**`mnemonic-read` and `config-write` are reserved and rejected by the host.** The mnemonic, session, and CLI token are host-only and never exposed to plugins. So the plugin never touches keys.

### 4.4 Command implementation pattern

```ts
import {
  type CommandIO, InputFieldType, type InputSchema,
  PluginCommand, schemaToArgs, schemaToFlags,
} from '@metamask/agent-wallet/plugin'

export default class ClaimlessReport extends PluginCommand<{ result: string }> {
  static override description = 'Report an AI agent incident to the Claimless registry.'
  static override flags = schemaToFlags(inputs)
  static override args = schemaToArgs(inputs)

  protected readonly pluginCommandId = 'claimless:report'

  async execute(io: CommandIO) {
    const { agentId, kind, severity } = await io.resolveInputs(inputs)
    const client = this.ctx.publicClient(10143)        // wallet-read
    const exec = this.ctx.walletExecutor(io, 'claimless:report')  // wallet-submit
    // build calldata → exec({ kind: 'transaction', ... })
    return { result: 'submitted' }
  }
}
```

Sealed methods (cannot be overridden): `run`, `runLifecycle`, `beforeExecute`, `init`, `prepareForRepl`, `withPluginIsolation`, and the `requiresAuth`/`requiresInit`/`requiresFees` getters. Fee-cache warmup is always off for plugin commands.

### 4.5 Local install and test

```bash
npm run build
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
mm claimless ping
```

Plugins are a **beta feature, off by default** — hence the two `mm config set` lines above.

### 4.6 Publish

```bash
npm publish
# users: mm plugins install <package>
```

Install is consent-gated and **fails closed** if the package cannot be verified. **Lifecycle scripts such as `postinstall` never run.**

## 5. Proposed plugin surface for Claimless

A small, focused surface. Three commands, each mapping to an existing SDK function.

| Command | Purpose | Maps to | Capability |
|---|---|---|---|
| `mm claimless report` | Report an incident for an agent (with stake + evidence hash) | `sdk.registry.reportIncident` | `wallet-submit` |
| `mm claimless risk <agentId>` | Read an agent's risk score + incident count | `sdk.risk.getRiskScore` | `wallet-read` |
| `mm claimless agent <agentId>` | Resolve ERC-8004 identity (owner, agentWallet, reputation summary) | `sdk.erc8004` | `wallet-read` |

**Deliberately not doing:** payments, key management, or anything requiring reserved capabilities. Keep the consent screen minimal so reviewers see a well-scoped plugin.

### 5.1 Natural-language usage this enables

Once installed, an agent operator can prompt:

> "Report a latency incident for agent 10182 with evidence hash 0xabc…"

and the agent routes it to `mm claimless report`. That is the distribution win.

## 6. Relationship to the rest of the architecture

```
Agent (MetaMask Agent Wallet)
   │  natural language
   ▼
mm claimless report          ← OUR PLUGIN (this document)
   │  wallet-submit
   ▼
IncidentRegistry.sol         ← staked, evidence-hashed (ours)
   │  summary published
   ▼
ERC-8004 Reputation Registry ← canonical, portable (0x8004B663…)
```

Three separate layers, each with a distinct role, each a different bounty:
- Plugin = **distribution** (MetaMask bounty, $2,500)
- IncidentRegistry = **the missing disclosure layer** (our core, Track 04)
- ERC-8004 = **portability** (Track 04 target)

## 7. Fit assessment — honest

**Strengths**
- MetaMask Agent Wallet **supports Monad testnet natively** (10143). Verified.
- The plugin system is documented, templated, and has an examples repo.
- We already designed `sdk/registry.ts` and `sdk/erc8004.ts`, so the plugin is a thin wrapper.
- $0 cost.
- It directly mitigates our verified cold-start weakness.

**Risks / caveats**
- **Plugins are beta and off by default.** Judges must enable two config flags to run it. Mitigation: document this in the README and show it in the demo video.
- **The exact bounty criteria are not published in detail.** We only have the one-line wording. Mitigation: satisfy the obvious reading (a real, published, working plugin that uses Agent Wallet's plugin API for a genuine purpose).
- **Unverified installs need a flag.** Publishing to npm resolves this for end users, but the publisher-verification path may not be instant. Mitigation: publish early, test both the `file:` and npm install paths.
- This is a **second wallet layer** alongside Privy. That is fine: Privy is our agent wallet for autonomous internal agents; the MetaMask plugin is how *external* operators' agents talk to us. They serve different audiences.

## 8. Implementation plan (2 days, fits Week 3)

| Step | Task | Deliverable | Gate |
|---|---|---|---|
| P1 | Clone `agent-wallet-plugin-template`, rename to `claimless-mm-plugin` | Working `mm claimless ping` | Command appears in `mm help` |
| P2 | Implement `claimless:risk` (read-only, `wallet-read`) | Risk score printed | Reads Incidents via RPC/Envio |
| P3 | Implement `claimless:report` (`wallet-submit`) | Real tx on Monad testnet | Explorer shows `IncidentReported` |
| P4 | Implement `claimless:agent` (ERC-8004 read) | Identity + reputation shown | Reads `0x8004B663…` |
| P5 | Publish to npm, document install | Public package | `mm plugins install <pkg>` works |
| P6 | Record in demo + `docs/sponsor-feedback.md` | Video segment + feedback | Bounty requirement met |

**Minimum viable (1 day):** P1 + P2. A read-only plugin already demonstrates the plugin API works and is far better than nothing.

## 9. Sources

| Source | Used for |
|---|---|
| `https://monad.xyz/metropolis` | bounty name and amount (VERIFIED) |
| `https://x.com/monad/status/2094826886870319533` | sponsor is **MetaMask** (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/` | Agent Wallet product, x402 support (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/plugins/` | plugin concept, capabilities, trust model (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/reference/plugins/` | manifest schema, context, SDK surface (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/plugins/build-a-plugin/` | step-by-step build + local test + publish (VERIFIED) |
| `https://docs.metamask.io/agent-wallet/reference/supported-chains/` | **Monad testnet 10143 and mainnet 143 supported** (VERIFIED) |
| `https://github.com/MetaMask/agent-wallet-plugin-template` | template repo exists (VERIFIED, HTTP 200) |
| `https://github.com/MetaMask/agent-wallet-plugin-examples` | examples repo exists (VERIFIED, HTTP 200) |
| npm `@metamask/agent-wallet` | latest **6.2.1**, 9 versions (VERIFIED) |
