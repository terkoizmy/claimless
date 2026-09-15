# Monad Testnet Deployment — Verified Live

> Chain 10143 · Deployed 2026-09-16 · Deployer `0xF601a214CF0FFf4741e7DD405FB5A75B46388395`

All three Claimless contracts are deployed, **source-verified**, and **exercised
end-to-end on-chain**. Every claim below has a real transaction behind it.

## Verification status: VERIFIED (exact match, all three)

Source is published and matches the deployed bytecode exactly.

| Contract | Address | Sourcify match |
|---|---|---|
| `IncidentRegistry` | `0xF856AC417597eb1aD952CEeb963FD51B1D2789cF` | `exact_match` (matchId 1854978) |
| `RiskScore` | `0xF61B247543D0719c74D222057E3dd49F863f87f9` | `exact_match` (matchId 1854979) |
| `AgentIdentity` | `0x7eFC535445E323fC50BF652D3fc42332057Ae703` | `exact_match` (matchId 1854980) |

Method: Sourcify via MonadVision's verifier (no API key needed).

```batch
set "PATH=%PATH%;C:\Users\terkoiz\.foundry\bin"
cd contracts
forge verify-contract <ADDRESS> src/<File>.sol:<Contract> ^
  --chain 10143 ^
  --verifier sourcify ^
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

Check a job:
```
curl https://sourcify-api-monad.blockvision.org/v2/verify/<JOB_ID>
```

View: https://testnet.monadscan.com/address/0xF856AC417597eb1aD952CEeb963FD51B1D2789cF
(MonadVision's address pages are behind bot protection, but the contract is
verified in MonadVision's own Sourcify instance — the source reads through.)

### Optional foundry.toml settings for verification

Monad's docs recommend these so the metadata does not depend on IPFS:

```toml
metadata = true
metadata_hash = "none"   # disable ipfs
use_literal_content = true
```

They were **not** needed here: our existing settings (solc 0.8.20, optimizer 200,
cancun) produced an exact match on the first attempt. Keep them in mind only if a
future change breaks verification.

## Addresses

| Contract | Address | Bytecode |
|---|---|---|
| `IncidentRegistry` | `0xF856AC417597eb1aD952CEeb963FD51B1D2789cF` | ✅ present |
| `RiskScore` | `0xF61B247543D0719c74D222057E3dd49F863f87f9` | ✅ present |
| `AgentIdentity` (ERC-8004 adapter) | `0x7eFC535445E323fC50BF652D3fc42332057Ae703` | ✅ present |

Canonical ERC-8004 registries (not ours, already deployed, never forked):

| Registry | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Machine-readable copy: `contracts/deployments/monad-testnet.json`.

Explorer: `https://testnet.monadvision.com/address/<addr>` (or Monadscan).

## Live verification transcript

### 1. Read-back of deployed state

| Call | Result |
|---|---|
| `IncidentRegistry.minStake()` | `10000000000000000` (0.01 MON) |
| `IncidentRegistry.CHALLENGE_WINDOW()` | `259200` (3 days) |
| `IncidentRegistry.totalIncidents()` | `0` (before writes) |
| `RiskScore.registry()` | `0xF856AC...` — wired to the registry |
| `RiskScore.getScore(10182)` | `100` (no incidents) |
| `AgentIdentity.identityRegistry()` | `0x8004A818...` — canonical, not ours |
| `AgentIdentity.TAG1_INCIDENT()` | `"claimless:incident"` |

### 2. Full incident lifecycle — a real write path

Agent `10182`, `kind = keccak256("SLA_BREACH")`, `severity = 4`, stake `0.01 MON`.

| Step | Tx |
|---|---|
| `reportIncident` | [`0x1434abbf...`](https://testnet.monadvision.com/tx/0x1434abbf0086e8be01a63bebd39685d78b9b4d1da7f505852453a15b561da424) |
| `challenge` (matching 0.01 MON bond) | [`0x10a3b48d...`](https://testnet.monadvision.com/tx/0x10a3b48d541261405e9223f32d943dc67aa9c0429c76dc9a46b0b1763029f15d) |
| `resolveChallenge(id, true)` | [`0xb1146cfd...`](https://testnet.monadvision.com/tx/0xb1146cfdd19ba2be8dfc2693d1e6f528037db6b64289c7bac4e011bbcbbfadaf) |

`IncidentReported` event emitted correctly with `agentId`, `incidentId`, `kind`, `severity`, `reporter`.

### 3. Score formula confirmed on-chain

```
before:  getScore(10182)              = 100
after:   getAcceptedCount(10182)      = 1
         getAcceptedSeveritySum(10182)= 4
         getScore(10182)              = 87
```

**100 − (1×5 + 4×2) = 87.** The documented formula executes exactly as written, on a real chain.

### 4. ERC-8004 write path — register + publish

| Step | Tx |
|---|---|
| `AgentIdentity.registerAgent("ipfs://bafyclaimless-demo-agent")` | [`0xd5cfd25d...`](https://testnet.monadvision.com/tx/d5cfd25dc4a9581ba499bf9f01fba98e40f27b1b91e033a52566200e933f7a34) |
| `AgentIdentity.publishRiskSummary(1867, -87e18, 18, "claimless:incident", "SLA_BREACH")` | [`0x9d2d2493...`](https://testnet.monadvision.com/tx/9d2d2493b24e4560716df8ed7c242980444e2033575dc64bba4c0b495edb09bb) |

Results:

- Agent minted as **agentId 1867** in the canonical IdentityRegistry.
- `ownerOf(1867)` on the canonical registry = `0xF601a214...` — **the operator**, not the adapter. The NFT hand-off works.
- `ReputationRegistry.getSummary(1867, [adapter], "claimless:incident", "")` returns **`(1, -87000000000000000000, 18)`**.

That last line is the whole thesis in one call: **Claimless published a real risk summary into the canonical ERC-8004 Reputation Registry**, which is the thing 827,827 registered agents have essentially never done.

## Two real bugs this deployment caught

Both were invisible in unit tests and only surfaced against the live canonical registry.
The mocks have since been made faithful so regressions are caught locally.

### Bug 1 — ERC-8004 mints with `_safeMint`, so the adapter needs `IERC721Receiver`

`registerAgent` reverted on-chain with `ERC721InvalidReceiver(0x7eFC...)`. Upstream
`IdentityRegistryUpgradeable.register` uses `_safeMint(msg.sender, agentId)`, which calls
`onERC721Received` on a contract recipient. The adapter did not implement it.

**Fix:** `AgentIdentity` now implements `IERC721Receiver`. The test mock's `_mint` now
performs the same receiver check instead of a plain mint.

### Bug 2 — agent ids start at 0, not 1

Upstream uses `agentId = $._lastId++`, so the first agent is **0**. `totalSupply()` also
reverts (there is no counter), so ids must come from `Registered` events or an indexer.

**Fix:** the mock initialises `nextAgentId = 0`, matching real behaviour.

## Reproduce

```batch
set "PATH=%PATH%;C:\Users\terkoiz\.foundry\bin"
cd contracts
set "MONAD_PRIVATE_KEY=<key>"
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast -vv
```

The script fails loudly if either canonical ERC-8004 registry is missing bytecode, because
Monad testnet can be reset and canonical contracts redeployed.

Then verify each contract against MonadVision's Sourcify instance:

```batch
forge verify-contract 0xF856AC417597eb1aD952CEeb963FD51B1D2789cF src/IncidentRegistry.sol:IncidentRegistry --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
forge verify-contract 0xF61B247543D0719c74D222057E3dd49F863f87f9 src/RiskScore.sol:RiskScore                  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
forge verify-contract 0x7eFC535445E323fC50BF652D3fc42332057Ae703 src/AgentIdentity.sol:AgentIdentity           --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```
