# Claimless — Verification Log

> Chronological record of what has been verified, on-chain or live. Every row has a
> transaction, a command output, or a screenshot behind it. Newest first.

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
