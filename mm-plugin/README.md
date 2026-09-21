# claimless-mm-plugin

MetaMask Agent Wallet (`mm`) plugin for [Claimless](https://github.com/terkoizmy/claimless):
the on-chain, staked incident-registry for ERC-8004 AI agents on Monad.

Once installed, an agent (or its operator) can check whether the agent it is about to hire has
a **disclosed incident record**, and file a **staked incident report**, without writing any
integration code:

```
mm claimless risk 42        # live RiskScore + accepted incidents (wallet-read)
mm claimless agent 42       # ERC-8004 identity + reputation summary (wallet-read)
mm claimless report ...     # staked incident, policy-gated by MetaMask (wallet-submit)
mm claimless ping           # liveness check, no wallet needed
```

## Why this exists

ERC-8004 solved registration (800k+ agents) but not **disclosure**: reporting an incident is
optional, unpunished, and requires custom integration. This plugin attacks the third cause.
If `mm claimless report` is one command away, an agent reports an incident the same way it
swaps tokens.

## Install (beta plugins)

```bash
npm install -g @metamask/agent-wallet
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install claimless-mm-plugin --accept-permissions
mm claimless ping
```

## Commands

| Command | Capability | What it does |
|---|---|---|
| `claimless ping` | none | Plugin liveness check. |
| `claimless risk <agentId>` | `wallet-read` | `RiskScore.getScore(agentId)` (0..100, 100 = clean) + `IncidentRegistry.getAcceptedCount/getAcceptedSeveritySum/getIncidentCount(agentId)` on Monad testnet (10143). |
| `claimless agent <agentId>` | `wallet-read` | Canonical `IdentityRegistry.ownerOf/getAgentWallet` + `AgentIdentity.getAgentRisk(agentId)` (Claimless-pushed summary in the canonical ReputationRegistry). |
| `claimless report <agentId> <kind> <severity> <evidenceHash> <stakeWei>` | `wallet-submit` | `IncidentRegistry.reportIncident(agentId, kindHash(kind), severity, evidenceHash)` with your stake, submitted through `ctx.walletExecutor(io, "claimless:report")` so MetaMask policy gates the transaction. |

All reads and writes target **Monad testnet (chain 10143)**, natively preconfigured in
MetaMask Agent Wallet. Addresses are read from `contracts/deployments/monad-testnet.json`
when available, with a documented fallback to the verified deployment.

### Severity scale

`1` minor · `2` moderate · `3` major · `4` severe · `5` catastrophic.

### Stake

The stake is a **bond**, not a fee. A challenger can match it within the 3-day
challenge window; the dispute winner takes both bonds. Unchallenged reports finalize
as ACCEPTED after the window. The plugin pre-flights `minStake()` and rejects a stake
below the minimum with a clear error before any wallet interaction.

### Evidence hash

Pass either a `0x`-prefixed 32-byte commitment (`0x` + 64 hex chars) or any plain string,
which the plugin hashes with `keccak256` on your behalf. The raw evidence payload stays
off-chain; only the commitment goes on chain.

## Permissions

- `claimless:risk` and `claimless:agent` request only `wallet-read`.
- `claimless:report` requests `wallet-submit`; every transaction is signed through the
  host executor and remains policy-gated by MetaMask.
- No `mnemonic-read`, no `config-write` (reserved, rejected by the host), no hooks, and
  no plugin-wide capabilities. The session, CLI token, and recovery phrase are host-only
  and never touched by this plugin.

## Contracts (Monad testnet, chain 10143)

| Contract | Address |
|---|---|
| IncidentRegistry | `0xf6B7b759EDcc25AC2D8e941ccbA0A03E401a771D` |
| RiskScore | `0xC839223ca14BFbe1DA4bC72e885eCe18caCed690` |
| AgentIdentity (ERC-8004 adapter) | `0x4871Cf94B11A5804F63629A21DFF133C6958eDfa` |
| IdentityRegistry (canonical ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry (canonical ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Build

```bash
npm install
npm run build   # tsc + oclif manifest
npm test        # unit tests (parsers, helpers, ABI encoding)
```

## Local dev install

```bash
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:<path-to-mm-plugin>" --accept-permissions
mm plugins uninstall claimless-mm-plugin   # between iterations
```

## License

MIT