# Chainlink CRE (Runtime Environment) — What It Is and How We Use It (VERIFIED 2026-09-15)

> Bounty: **"Best workflow with CRE" — $3,000**, sponsored by Chainlink.
> Role in Claimless: the **automation layer** that evaluates our parametric triggers and executes payouts.

## 0. What CRE is, in one paragraph

**CRE = Chainlink Runtime Environment.** It is Chainlink's **orchestration layer** for smart contracts. You write **workflows** in Go or TypeScript using the CRE SDK, compile them with the **CRE CLI**, and run them across a **Decentralized Oracle Network (DON)**. A workflow watches for a **trigger** (a schedule, an HTTP event, a blockchain log), runs your **callback** logic, and can then read from or write to a blockchain. Every step runs on multiple independent nodes and is aggregated by **Byzantine Fault Tolerant consensus**, so the result is a single verified outcome rather than one server's opinion.

Chainlink's own wording:
> "CRE is the all-in-one orchestration layer unlocking institutional-grade smart contracts—data-connected, compliance-ready, privacy-preserving, and interoperable across blockchains and existing systems."

## 1. The concepts you actually need

| Term | Meaning |
|---|---|
| **Workflow** | Your compiled WebAssembly (WASM) binary |
| **Trigger** | What starts an execution: `cron`, HTTP, EVM log |
| **Callback** | Your function that runs when the trigger fires |
| **Handler** | `handler(trigger, callback)` — the glue pairing one trigger to one callback |
| **Capability** | A decentralized microservice: EVM read, EVM write, HTTP fetch |
| **Workflow DON** | Watches triggers and coordinates execution |
| **Capability DON** | Executes a specific capability |
| **Report** | A DON-signed data package from `runtime.report()` |
| **Consensus** | BFT protocol merging node results into one trusted outcome |

The **trigger-and-callback model** is the core pattern. A minimal handler looks like:

```go
cre.Handler(
  cron.Trigger(&cron.Config{Schedule: "0 */10 * * * *"}), // every 10 minutes
  onCronTrigger,                                          // your logic
)
```

## 2. Why this matters for Claimless

Our thesis is **"zero human adjudication"**. That is only credible if something *automatic* actually evaluates the trigger and executes the payout. CRE is that something.

Mapping onto our four contracts:

| Our contract | CRE's job |
|---|---|
| `IncidentRegistry` | (not CRE — reports come from reporters) |
| `RiskScore` | CRE can periodically `recompute` scores on a schedule |
| `ParametricTrigger` | **CRE's main job:** on a cron/HTTP trigger, check the condition and call `evaluate()` then `payout()` |
| `CoverPool` | CRE reads capacity before a payout |

**Concretely:** our triggers are *narrow and deterministic* (latency, HTTP status, completion rate), so CRE can evaluate them without judgment. That is exactly the design decision already recorded in `IDEA.md` ("narrow, deterministic triggers, not 'AI failed'").

The flow:

```
cron / HTTP trigger
        │
        ▼
   CRE workflow
        │
   ┌────┴─────┐
   ▼          ▼
HTTP call   EVM read
(target API) (RiskScore, CoverPool)
   │          │
   └────┬─────┘
        ▼
  evaluate condition
        │
        ▼
   EVM write → ParametricTrigger.payout()
```

## 3. The EVM write path (important architectural detail)

CRE does **not** write to your contract directly. The flow is:

1. Your workflow generates a **cryptographically signed report** containing the ABI-encoded data.
2. The **EVM Write capability** submits that report to a Chainlink-managed **`KeystoneForwarder`** contract.
3. The forwarder **validates the report's signatures**.
4. The forwarder calls your consumer contract's **`onReport(bytes metadata, bytes report)`** function.

**Consequence for us:** `ParametricTrigger.sol` must implement the **`IReceiver`** interface and expose `onReport(...)`. This is a real constraint on the contract design, and it is a good thing — it means payout delivery is verifiable rather than trusted.

## 4. Cost: free to build and simulate

| Activity | Cost | Approval needed? |
|---|---|---|
| Create a CRE account | Free | No |
| Install the CRE CLI | Free | No |
| Build workflows (Go/TS SDK) | Free | No |
| **Simulate workflows** | **Free** | **No** |
| Deploy to a DON | Requires access | ✅ **Yes — `cre account access`** |

Chainlink's docs, verbatim:
> "You can start building and simulating CRE workflows immediately, without any approval"
> "Deploying workflows requires approval."

**Simulation is not a toy.** It compiles your workflow to WASM and runs it locally, but makes **real calls to live APIs and public EVM blockchains**. So a simulation genuinely exercises our trigger logic against real data, with no deployment approval and no funds.

**This matches our no-money rule exactly:** the bounty requires a *workflow*, and simulation satisfies that. Deployment access is a nice-to-have, not a blocker.

## 5. CLI installation (Windows, VERIFIED)

Recommended version at time of writing: **v1.32.0**.

**Automatic:**
```powershell
irm https://app.chain.link/cre/install.ps1 | iex
cre version   # expect: CRE CLI version v1.32.0
```
This downloads the correct binary, verifies integrity, and installs to `$env:LOCALAPPDATA\Programs\cre`.

**Manual:** download `cre_windows_amd64.zip` from `github.com/smartcontractkit/cre-cli/releases`, verify SHA-256 against the release page, rename the exe to `cre.exe`, add its folder to PATH.

### CLI commands we care about

```
cre init        # initialize a project
cre version     # verify install
cre account access   # request deploy access
```
Plus the simulation and lifecycle commands: build, simulate, deploy, activate, pause, update, delete, monitor.

## 6. Monad support — partial evidence, must be verified at build time

This is the one **uncertain** point, and I will not overstate it.

| Evidence | Status |
|---|---|
| CRE's EVM Read/Write targets "**any EVM-compatible blockchain**" | ✅ VERIFIED (docs wording) |
| Chain targeting uses **Chainlink's chain selector system** | ✅ VERIFIED (docs wording) |
| **Monad testnet has a Chainlink chain selector: `2183018362218727504`** | ✅ VERIFIED (CCIP directory) |
| Monad listed explicitly in CRE's own supported-chain list | ❌ **NOT FOUND** — no `monad` appears in `docs.chain.link` index |

**Honest reading:** Monad has a Chainlink chain selector, which is the mechanism CRE uses to target chains, so support is *likely*. But there is no explicit CRE-and-Monad page, so **we must confirm it during Day 2 setup** by testing a simulation that reads from Monad testnet RPC.

**Fallback if Monad is not yet supported by CRE's EVM capability:** simulate the workflow against **Sepolia** (CRE's documented target) and demonstrate the Monad write path with a direct script. The bounty asks for a CRE workflow, not a specific chain, and simulating on Sepolia with a documented path to Monad is honest and complete.

## 7. What our workflow will do

A single, focused workflow is enough and is better than a complex one:

```
Trigger: cron (every 10 minutes)
  1. EVM read: RiskScore.getScore(agentId) for agents with active coverage
  2. HTTP fetch: the SLA endpoint for a covered agent
  3. Evaluate: latency > threshold ? (deterministic, no judgment)
  4. If met: EVM write → ParametricTrigger.onReport(...) → payout
```

**Deliverable:** `cre/workflow/trigger.ts` (or `.go`), plus `cre/README.md`, plus a recorded simulation.

**Definition of done:** `cre workflow simulate` succeeds and the logs show a real trigger evaluation and a real on-chain read.

## 8. Bounty fit

| Requirement (from our own reading) | Our compliance |
|---|---|
| Use CRE as an orchestration layer | ✅ Cron + HTTP + EVM read/write in one workflow |
| Workflow actually built | ✅ `cre/workflow/` with TS or Go |
| Demonstrated | ✅ Simulation recording |
| Integration feedback | ✅ `docs/sponsor-feedback.md` |

## 9. Risks, honestly

| Risk | Mitigation |
|---|---|
| Monad not in CRE's chain list yet | Simulate on Sepolia; document the path. Verify Day 2. |
| Deploy access approval is slow | Simulation suffices for the bounty; request access early anyway |
| `IReceiver` requirement adds contract work | Add `onReport(...)` to `ParametricTrigger` from the start |
| CRE concepts are new to us | The official tutorial builds cron → HTTP → EVM read → EVM write. That is almost exactly our workflow shape. |

## 10. Sources

| Source | Used for |
|---|---|
| `https://docs.chain.link/cre` | what CRE is, DON, trigger-and-callback, build-vs-deploy, simulate = real calls (VERIFIED) |
| `https://docs.chain.link/cre/getting-started/cli-installation/windows` | Windows install, v1.32.0, `cre version`, manual + auto paths (VERIFIED) |
| `https://docs.chain.link/cre/capabilities/evm-read-write.md` | EVM read/write, KeystoneForwarder, `IReceiver.onReport`, "any EVM-compatible blockchain" (VERIFIED) |
| `https://docs.chain.link/cre/guides/workflow/using-evm-client/overview-ts.md` | viem-based ABI handling, read/write guides (VERIFIED) |
| `https://docs.chain.link/cre/getting-started/overview.md` | tutorial shape: cron + HTTP + EVM read + EVM write (VERIFIED) |
| `https://docs.chain.link/ccip/directory/testnet/chain/monad-testnet` | Monad testnet chain selector `2183018362218727504` (VERIFIED) |
