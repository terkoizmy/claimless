# Claimless — Verification Log

> Chronological record of what has been verified, on-chain or live. Every row has a
> transaction, a command output, or a screenshot behind it. Newest first.
>
> **Address caveat (2026-09-21):** a redeploy on Sep 21 created a new contract set that
> added `CoverPool` and `ParametricTrigger`. Entries dated **Sep 16** name the pre-redeploy
> addresses (`0xF856…`, `0xF61B…`, `0x7eFC…`) and are historically accurate. The current
> canonical addresses are in `contracts/deployments/monad-testnet.json` and in `AGENTS.md`.
> Canonical ERC-8004 registry addresses did not change.

## 2026-09-21 — security fix redeployed; demo state restored

Two access-control bugs found in the previous deployment were fixed and the
whole stack redeployed (all five contracts, `pool.setTrigger(trigger)` wired in
the deploy script).

| Check | Evidence |
|---|---|
| Contract tests (with both regressions) | **96 passed, 0 failed** |
| Attacker cannot execute a payout | `executePayout(0)` from `0x…dEaD` reverts `NotTriggerAuthorised` on the live pool |
| Pool wired to the trigger | `pool.trigger()` == the deployed `ParametricTrigger` |
| `sdk verify` against the new set | **5 passed, 0 failed** |
| Demo state | 10182 score **87**, policy armed (`checkCondition` → `met=true, fired=false`); pool funded 2 MON |

## 2026-09-21 — redeploy, demo state, CRE simulation

**Result:** `cd sdk && npm run verify` → **5 passed, 0 failed** against the new deployment.

| Check | Evidence |
|---|---|
| Score from the contract | `87` (`acceptedCount=1`, `severitySum=4`) |
| Score from the Envio indexer | `87` (independent process, GraphQL) |
| Both paths agree | PASS |
| ERC-8004 reputation readable | `count=1`, `value=-100`, `decimals=18`, `tag1=claimless:incident` |
| Aurora Intents live dry quote | PASS (no API key, no funds) |
| Parametric trigger armed | `checkCondition(policy 1)` → `met=true, score=87, accepted=1, fired=false` |
| CRE workflow simulate | `[claimless] agent=10182 score=87 accepted=1 breach=false` (matches the contract) |
| Contracts deployed | 93/93 forge tests; 5 contracts with bytecode on chain 10143 |

## 2026-09-16 — Week 2: SDK, autonomous agent, sponsor adapters

**Result:** `cd sdk && pnpm verify` → **5 passed, 0 failed**.

| Check | Evidence |
|---|---|
| Score from the contract | `87` (`acceptedCount=1`, `severitySum=4`) |
| Score from the Envio indexer | `87` (independent process, GraphQL) |
| Both paths agree | PASS |
| `getAcceptedCount` matches the score input | PASS |
| `CHALLENGE_WINDOW` = 3 days | PASS (`259200s`) |
| ERC-8004 reputation round trip | `count=1`, `value=-87000000000000000000`, `decimals=18`, `tag1=claimless:incident` |
| Aurora Intents live dry quote | `amountOut=498070`, `37s`, no API key, no funds |

**Autonomous report, live:** `agents/reporter.ts` reported a real incident with no
human interaction.

| Step | Value |
|---|---|
| tx | `0x3d191d29c7e962728e5d212b8d45c8473804d32446b942dc77c46f1833d49938` |
| block | `62843734` (status success) |
| incident | id `1`, kind `WRONG_OUTPUT`, severity `3`, status `PENDING` |
| indexer | picked it up in realtime: `incidentCount: 2` in GraphQL |

**CRE workflow encoding verified against the live chain:** `cast sig` gives
`0x0e1af57b` for `getScore(uint256)` and `0xa437d4f7` for `getAcceptedCount(uint256)`;
raw `eth_call` with that calldata returns `87` and `1` respectively. So the
workflow's hand-rolled ABI encoding is correct against real state.

Details, including seven bugs found and fixed, are in `WEEK2_NOTES.md`.

## 2026-09-16 — Contracts source-verified on MonadVision

All three contracts return `exact_match` from Sourcify.

| Contract | Address | Match |
|---|---|---|
| `IncidentRegistry` | `0xF856AC417597eb1aD952CEeb963FD51B1D2789cF` | exact (matchId 1854978) |
| `RiskScore` | `0xF61B247543D0719c74D222057E3dd49F863f87f9` | exact (matchId 1854979) |
| `AgentIdentity` | `0x7eFC535445E323fC50BF652D3fc42332057Ae703` | exact (matchId 1854980) |

## 2026-09-16 — Envio indexer running live

**Result:** the self-hosted Envio stack indexes real Monad testnet events and serves
them over Hasura GraphQL. Full pipeline verified.

| Step | Evidence |
|---|---|
| `IncidentReported` | 1 row: `agentId=10182`, `severity=4`, `reporter=0xF601a214...`, `txHash=0x814a6530...`, `blockNumber=62822763` |
| `IncidentChallenged` | status → `CHALLENGED`; `Challenge` entity created with `resolved=false` |
| `ChallengeResolved` | `resolved=true`, `reportStands=true`, `winner=0xF601a214...` |
| `IncidentFinalized` | status → `ACCEPTED` |
| `Agent` aggregate | `incidentCount=1`, `acceptedCount=1`, `pendingCount=0`, `severitySum=4` |
| `ScoreUpdated` | `ScoreSnapshot` → `oldScore=0`, `newScore=87` |
| Relation | `Incident.agent` resolves to the `Agent` row (`10182`) |

The indexed score **87** matches the on-chain `RiskScore.getScore(10182)` from the
earlier deploy verification. GraphQL endpoint: `http://localhost:8081/v1/graphql`.

**Hard constraint discovered:** Envio publishes **no Windows binary** (only linux and
darwin). The indexer must run via Docker/WSL on this machine.

Eight configuration defects were found and fixed; each is documented in
`indexer/README.md` §"Configuration notes" so they are not reintroduced:
wrong API version (v2 vs v3), hand-declared relation id columns, missing `<field>_id`
assignment, `uint8`→`Int` coercion, undeclared `event.transaction`/`block.timestamp`,
`Timestamp!` vs `BigInt!`, address interpolation at `codegen` time, and the
`start_block` checkpoint rule.

See also `DEPLOYMENT.md` for the contract-side verification.

## 2026-09-16 — Contracts deployed + full lifecycle on Monad testnet

**Result:** all three contracts live on chain 10143 and exercised end-to-end.

| Contract | Address |
|---|---|
| `IncidentRegistry` | `0xF856AC417597eb1aD952CEeb963FD51B1D2789cF` |
| `RiskScore` | `0xF61B247543D0719c74D222057E3dd49F863f87f9` |
| `AgentIdentity` | `0x7eFC535445E323fC50BF652D3fc42332057Ae703` |

| Check | Result |
|---|---|
| `minStake()` | `10000000000000000` (0.01 MON) |
| `CHALLENGE_WINDOW()` | `259200` (3 days) |
| `reportIncident` → `challenge` → `resolveChallenge(id, true)` | 3 successful txs |
| Score formula | `getScore(10182)`: **100 → 87** after 1 accepted incident of severity 4 (`100 − (1×5 + 4×2)`) |
| `registerAgent` | agent **1867** minted in the canonical ERC-8004 IdentityRegistry |
| NFT hand-off | `ownerOf(1867)` = the operator, not the adapter |
| `publishRiskSummary` | `getSummary(1867, [adapter], "claimless:incident", "")` → `(1, -87000000000000000000, 18)` |

**Two real bugs caught only by the live canonical registry** (mocks had hidden them):

1. ERC-8004 mints with `_safeMint`, so the adapter needs `IERC721Receiver`. Fixed,
   and the test mock now performs the same receiver check.
2. ERC-8004 agent ids start at **0**, not 1 (`agentId = $._lastId++`). Mock aligned.

Details and tx hashes: `DEPLOYMENT.md`.

## 2026-09-15 — Interfaces verified against official ERC-8004 ABIs

`getSummary` returns `(uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`.
Earlier drafts said `uint256` for `count`; corrected from the upstream ABI saved at
`contracts/abis/`.

## 2026-09-15 — Aurora Intents facts settled

No testnet, ever. Faucet USDC cannot be routed through Intents (testnet assets are
absent from the registry by design). Demo uses `dry: true`. Full detail in
`AURORA_INTENTS_IMPLEMENTATION.md` §12-15. Do not re-research.
