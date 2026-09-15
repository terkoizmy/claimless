# Claimless agents

Autonomous agent demos. These are the actors that report incidents into the
on-chain registry **without a human in the loop** — the point of the whole system.

## `reporter.ts`

An autonomous incident reporter. It:

1. resolves a signer — a **Privy agent wallet** when configured, otherwise the
   local-key fallback
2. verifies it can reach Monad testnet and that `IncidentRegistry` actually has
   bytecode (Monad testnet gets reset, so this check matters)
3. reports an incident with a staked bond and a hashed evidence commitment
4. reads the incident back from the contract and prints the explorer link

The evidence payload itself stays off-chain; only `keccak256(payload)` goes on
chain. The bond is the anti-spam stake — an unchallenged report is accepted after
the challenge window, and a false report can be disputed by matching the bond.

### Run it

```batch
cd sdk
set "MONAD_PRIVATE_KEY=0x..."       :: or configure PRIVY_APP_ID + PRIVY_APP_SECRET
pnpm report
```

Useful overrides:

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_ID` | `10182` | ERC-8004 agent id to report against |
| `INCIDENT_KIND` | `SLA_BREACH` | one of the kinds in `src/config.ts` |
| `SEVERITY` | `4` | 1 (minor) .. 5 (catastrophic) |
| `STAKE_MON` | contract `minStake()` | bond to post |
| `DRY_RUN` | `0` | `1` validates and prints the plan without sending |

```batch
:: validate without spending anything
set DRY_RUN=1
pnpm report
```

## Wallet separation (why two signer kinds)

| Actor | Wallet | Why |
|---|---|---|
| Human underwriter | **Mera passkey** | needs user presence; device-bound; cannot run headless |
| Autonomous agent | **Privy agent wallet** | key lives in a TEE; the agent holds only an ephemeral signing key; policy engine caps spending |

They are not competitors — they solve different problems. See
`docs/WALLET_DECISION.md`.

### Private key handling

- **Local fallback** (current demo): the key comes from `MONAD_PRIVATE_KEY`. Fine
  for testnet, never for production.
- **Privy** (production path, live test pending): the private key never reaches the
  agent process. `sdk/src/privy.ts` documents the verified facts and
  `sdk/src/signer.ts#createPrivySigner` isolates the two REST calls that still need
  confirming against the Privy dashboard.
