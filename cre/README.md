# Chainlink CRE — Claimless parametric trigger

> Bounty: **"Best workflow with CRE" ($3,000)** — CRE as the trigger orchestration
> layer, not decoration.

## Why CRE is load-bearing here

Claimless's core claim is **no committee, no voting, no human adjudication**. But
if our own server runs the trigger check, that server becomes the single party
deciding — which is the exact failure mode we designed against (Nexus Mutual went
V1 token voting → V2 stake-weighted → V3 three human experts).

CRE removes that central point. The workflow runs on a **Decentralized Oracle
Network**, and any on-chain write travels through Chainlink's
**KeystoneForwarder**, which validates a signed report before calling
`onReport(bytes, bytes)` on our consumer contract. No single process decides.

## Status

| Item | State |
|---|---|
| CRE CLI | **installed, v1.34.0** (Monad testnet needs ≥ v1.30.0) |
| Project layout | scaffolded in the official structure (`project.yaml`, `secrets.yaml`, workflow dir) |
| Workflow code | read-only evaluation implemented (cron → read → decide → log) |
| Selectors + encoding | **verified live** against the deployed contracts (see below) |
| `cre workflow simulate` | **pending `cre login`** — needs an account (human step) |
| On-chain write (`writeReport`) | not wired yet: needs `ParametricTrigger.onReport` (Week 3) + the forwarder address |

## What the workflow does now

1. cron trigger (every 5 minutes)
2. reads `RiskScore.getScore(agentId)` and `IncidentRegistry.getAcceptedCount(agentId)` from Monad testnet
3. evaluates the parametric condition: **score < 90 → payout due**
4. logs the decision and returns a structured evaluation

The condition is deliberately narrow and numeric. Basis risk is a known hazard in
parametric cover, so the trigger must be a number anyone can re-derive — not a
judgement call.

## Verified: the workflow's raw calldata reaches the real contracts

The workflow builds calldata by hand (to stay WASM-friendly, with no keccak
dependency in the bundle). That encoding was checked against the live chain:

| Step | Command | Result |
|---|---|---|
| selector | `cast sig "getScore(uint256)"` | `0x0e1af57b` |
| selector | `cast sig "getAcceptedCount(uint256)"` | `0xa437d4f7` |
| calldata built by the workflow | `0x0e1af57b` + agent 10182 padded | matches `cast calldata` exactly |
| live read via that calldata | `cast call <RiskScore> 0x0e1af57b…27c6` | `0x…0057` → **87** |
| live read via that calldata | `cast call <IncidentRegistry> 0xa437d4f7…27c6` | `0x…0001` → **1** |

So `encodeCall`/`decodeUint256` are correct against real state, not just against a
mock. The two selectors are pinned as literals with the verification recorded in a
comment, which is why no keccak library is needed in the WASM build.

## Layout

```
cre/
├── project.yaml                 # targets: staging-settings, production-settings (+ RPCs)
├── secrets.yaml                 # secret name declarations (empty: nothing secret yet)
└── claimless-trigger/
    ├── main.ts                  # the workflow
    ├── package.json             # @chainlink/cre-sdk
    ├── tsconfig.json
    └── workflow.yaml            # per-workflow settings
```

## Running it

```batch
:: CRE CLI (already installed to %LOCALAPPDATA%\Programs\cre)
set "PATH=%PATH%;%LOCALAPPDATA%\Programs\cre"
cre version                 :: expect v1.34.0 or newer
cre login                   :: human step: opens an auth flow
cre workflow simulate claimless-trigger --target staging-settings
```

Simulation is free and needs no deployment. Deploying needs approval
(`cre account access`) and is **not required for the demo**.

## Notes and caveats (honest)

- **`cre login` is a human step.** It needs an account, so the first simulation
  waits on that. Everything else is in place.
- **CRE workflows run in QuickJS/WASM, not Node.** Node builtins (`node:crypto`,
  `node:fs`) are unavailable. That is why the ABI encoding above is hand-rolled
  and the selectors are literals.
- **No LINK token required.** LINK is only for classic oracle services.
- **Monad support is version-gated:** testnet needs CLI ≥ v1.30.0 and TS SDK
  ≥ v1.19.0. Monad mainnet needs CLI ≥ v1.29.0.
- **The write path is not faked.** `writeReport` is left out rather than stubbed,
  because a half-wired payout path in a repository about trustworthy payouts would
  be the wrong signal.
