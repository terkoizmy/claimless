# Week 2 — SDK & Integrations

> Completed 2026-09-16. Every claim below is backed by a command that was actually
> run. Re-run the whole thing with `cd sdk && pnpm verify`.

## Gate

`PLAN.md` §2 Week 2 gate: **"End-to-end flow — agent reports → score forms →
visible in UI."** The flow is proven end-to-end; only the UI itself is Week 3.

```bash
cd sdk && pnpm verify
# Result: 5 passed, 0 failed
```

| Check | Result |
|---|---|
| Risk score from the contract | `87` (`acceptedCount=1`, `severitySum=4`) |
| Risk score from the Envio indexer | `87` (`acceptedCount=1`, `severitySum=4`) |
| Two independent paths agree | **PASS** |
| `getAcceptedCount` matches the score's own input | **PASS** |
| Challenge window is 3 days | **PASS** (`259200s`) |
| ERC-8004 reputation readable | **PASS** (`count=1`, `value=-87e18`, `decimals=18`) |
| Aurora Intents live dry quote | **PASS** (`amountOut=498070`, `37s`, no key, no funds) |

`totalIncidents=2` — one incident was reported autonomously by `agents/reporter.ts`
during this week.

## What was built

### SDK (`sdk/`)

| Module | What it does | Verified |
|---|---|---|
| `config.ts` | Deployed addresses, ERC-8004 registry addresses, incident kinds | matches `contracts/deployments/monad-testnet.json` |
| `env.ts` | Config with working defaults; missing values only fail when used | read paths work with zero env vars |
| `chain.ts` | viem clients + chain/code assertions | live |
| `hash.ts` | `kindHash` (keccak of kind string), `evidenceHash`, canonical `stableStringify` | live tx |
| `registry.ts` | Read/write the IncidentRegistry; pre-validates to give named errors | live tx `0x3d191d29…` |
| `risk.ts` | Contract-first score with indexer fallback + TTL cache | live, fallback proven offline |
| `envio.ts` | GraphQL over the indexer | live against running indexer |
| `erc8004.ts` | Read identity/reputation; publish summaries via the adapter | `getSummary` = `-87e18` |
| `intents.ts` | Aurora Intents deposits, `dry: true` by default | live quote, no key |
| `nansen.ts` | Reporter-credibility signals with a real credit ledger + disk cache | credit table printed; live call pending a key |
| `signer.ts` | Signer abstraction: Privy or local key | local path live |
| `privy.ts` | Privy agent-wallet facts + readiness | code complete, live test pending credentials |
| `mera.ts` | Passkey accounts; `deriveManyKeys` (one passkey, many keys) | derivation works; PRF ceremony needs a browser |

Demos: `registry:demo`, `risk:demo`, `envio:demo`, `erc8004:demo`, `intents:demo`,
`nansen:demo`, `mera:demo`, plus `verify` and `report`.

### Agent (`agents/reporter.ts`)

An autonomous incident reporter. Verified live:

```
[signer] kind=local address=0xF601a214…
[chain] connected to chain 10143 (Monad testnet)
[report] agentId=10182 kind=WRONG_OUTPUT severity=3/5 stake=0.01 MON
[tx] submitted: 0x3d191d29c7e962728e5d212b8d45c8473804d32446b942dc77c46f1833d49938
[result] incidents before=1 after=2
[result] incident id=1 status=PENDING severity=3
```

The Envio indexer picked it up in realtime: `incidentCount: 2` in GraphQL within
seconds. That is the whole pipeline: **agent → chain → indexer → API**.

### CRE (`cre/`)

Scaffolded in Chainlink's official project layout. CLI **v1.34.0** installed
(Monad testnet needs ≥ v1.30.0). The workflow reads `RiskScore.getScore` and
`IncidentRegistry.getAcceptedCount` on a cron trigger and evaluates the parametric
condition (score < 90 → payout due).

Its hand-rolled ABI encoding was verified against the live chain:

| Item | Verified value |
|---|---|
| `cast sig "getScore(uint256)"` | `0x0e1af57b` |
| `cast sig "getAcceptedCount(uint256)"` | `0xa437d4f7` |
| calldata built by the workflow | matches `cast calldata` exactly |
| live read through that calldata | `0x…0057` = **87**, `0x…0001` = **1** |

## Bugs found and fixed

1. **Mera module was broken on arrival** (worker-written): missing imports
   (`entropyToMnemonic`, `mnemonicToSeedSync`, `mnemonicToAccount`), undefined
   `SubtleCryptoLike`, `require()` inside an ESM module, and DOM types referenced
   without a DOM lib. Rewritten to use `@scure/bip39` + `@scure/bip32` (already in
   viem's tree) with locally declared structural types for the browser APIs.
2. **`nansen.ts` had corrupted tokens** (`number typo;`, a stray backtick) that
   broke the parser.
3. **`erc8004.ts` had an unsafe cast** from `readonly unknown[]` to an args object.
4. **`registry.ts` had 8 viem typing errors**: `ContractFunctionRevertedError`
   no longer exposes `errorName` directly (now under `.data`), `map(BigInt)` is not
   a valid callback, and `writeContract` requires an explicit `chain`.
5. **`agents/reporter.ts` could not resolve `viem`** from outside `sdk/`. Fixed by
   re-exporting `parseEther`/`formatEther` from the SDK surface so consumers never
   resolve dependencies themselves.
6. **My own verification script read a non-existent field** (`quote.amountOut`
   instead of the nested `quote.quote.amountOut`). Fixed; the API's shape is now
   documented in the script.
7. **Stray worker artifacts**: a PowerShell-redirect filename
   (`sdk/0)console.log(t.slice(Math.max(0`) and two `.log` files were committed by
   accident. Removed, and `*.log` is gitignored.

## Swarm notes (process)

Wave A (SDK core) and Wave B (sponsors) both produced working modules, but the
pattern was consistent: **workers stall at the `tsc` iteration stage.** Four
workers ran 15-25 minutes and had to be stopped (`dog`, `hamster`, `badger`,
`sauropod`, `duck`, `goat`), and two never wrote their files at all (`badger`
after 23 minutes, `duck` after 17). What worked:

- pre-writing shared interfaces/`index.ts` so workers have fixed seams
- giving exact error text in a follow-up message rather than "fix the tests"
- taking over yourself once a worker has burned ~10 minutes without new files

Net: the SDK is faster to build by hand than by swarm for anything in one file,
but swarm is genuinely useful for independent files (contracts, docs, indexers).

## Still pending (needs a human)

| Item | Blocker |
|---|---|
| Privy live test | no `PRIVY_APP_ID` / `PRIVY_APP_SECRET` yet (fallback works) |
| Mera real passkey ceremony | needs a browser + passkey in Google Password Manager |
| Nansen live call | no `NANSEN_API_KEY` yet (adapter is credit-safe by design) |
| CRE first simulation | needs `cre login` (an account) |
| Aurora live proof (optional) | $0.50 USDC on Base; dry quotes already work |
