# Envio Indexer — Claimless

Indexes `IncidentRegistry` and `RiskScore` on **Monad testnet (chain 10143)** and
serves the data over GraphQL (Hasura) so the dashboard and SDK read aggregates
without on-chain calls.

## Status: working, verified live

The stack runs and indexes real events end-to-end. Verified 2026-09-16:

| Check | Result |
|---|---|
| Indexer ready | `The indexer is ready. Switching to realtime indexing.` |
| `IncidentReported` | 1 row, correct `agentId`, `severity`, `reporter`, `txHash`, `blockNumber` |
| `IncidentChallenged` | status flipped to `CHALLENGED`, `Challenge` entity created |
| `ChallengeResolved` | `resolved=true`, `reportStands=true`, `winner` set |
| `IncidentFinalized` | status `ACCEPTED` |
| `Agent` aggregate | `incidentCount=1, acceptedCount=1, pendingCount=0, severitySum=4` |
| `ScoreUpdated` | `ScoreSnapshot` recorded `oldScore=0 → newScore=87` |
| Relation | `Incident.agent` resolves to the `Agent` row |

The indexed score (87) matches the on-chain `RiskScore.getScore(10182)` exactly.

## Prerequisite: Envio has no Windows binary

**Envio ships binaries only for `linux-x64`, `linux-x64-musl`, `linux-arm64`,
`darwin-x64`, `darwin-arm64`.** There is no Windows build, so `envio codegen` and
`envio start` cannot run natively on Windows. Docker is the supported path here.

This machine already runs Docker Desktop, so the self-hosted compose stack is the
way to run it. (WSL2 with a Linux Node install would work too.)

## Quick start

```batch
cd indexer
copy .env.example .env
:: fill INCIDENT_REGISTRY_ADDRESS, RISK_SCORE_ADDRESS and ENVIO_API_TOKEN
docker compose up -d --build
```

Then query:

```bash
curl http://localhost:8081/v1/graphql \
  -H 'Content-Type: application/json' \
  -H 'x-hasura-admin-secret: testing' \
  -d '{"query":"{ Agent { id incidentCount acceptedCount severitySum currentScore } Incident { id status severity } }"}'
```

## Ports used (this machine)

| Service | Host port | Container port | Note |
|---|---|---|---|
| Postgres | **5433** | 5432 | 5432 is taken by `agentic-scraper-postgres` + a local Postgres — do not remap |
| Hasura | **8081** | 8080 | Console at http://localhost:8081/console |
| Indexer metrics | **9898** | 9898 | Bound to `127.0.0.1` |

Inside the compose network services talk on their standard ports; only the
host-side mappings are shifted.

## Data sources

`CONFIG_FILE` selects the sync source:

| File | Source | Needs |
|---|---|---|
| `config.yaml` | HyperSync (`https://10143.hypersync.xyz`) | `ENVIO_API_TOKEN` (free, https://envio.dev/app/api-tokens) |
| `config.rpc.yaml` | `MONAD_RPC_URL` | nothing — fully token-free |

Both index the same events with the same handlers.

> **Verified:** HyperSync for chain 10143 accepts the token as
> `Authorization: Bearer <token>`. A request with **no** Authorization header
> returns `Your token is malformed` — that message means "no token", not "bad token".

## Configuration notes (each was a real failure, do not undo)

1. **Contract addresses are required at `codegen` time.** `config.yaml`
   interpolates `${INCIDENT_REGISTRY_ADDRESS}` / `${RISK_SCORE_ADDRESS}`, so the
   Dockerfile takes them as build args. The default is a zero address so the
   image can still be built; pass real values to build a usable image.

2. **Do not declare `agent_id` / `incident_id` in `schema.graphql`.** Envio
   generates those columns for the `agent: Agent!` / `incident: Incident!`
   relations. Hand-declaring them collides and the insert fails with
   `cannot cast type bigint to integer[]`.

3. **Set relations with `<field>_id` in handlers**, e.g. `agent_id: agentId`.
   Without it the FK column stays NULL and the insert fails the not-null
   constraint.

4. **Solidity `uint8` arrives as `bigint`.** The `severity` field is `Int` in the
   schema, so it needs `Number(event.params.severity)`, otherwise the insert fails
   with `cannot cast type bigint to integer[]`.

5. **`event.transaction` and `event.block.timestamp` are empty unless declared.**
   Use the `fields` option per registration:
   ```ts
   { contract: "IncidentRegistry", event: "IncidentReported",
     fields: { transaction: ["hash"], block: ["timestamp"] } }
   ```
   Reading an undeclared field yields `undefined`, which surfaces as
   `Cannot convert undefined to a BigInt` or a `txHash` not-null violation.

6. **`Timestamp!` fields need a `Date`, not a number.** `firstSeenAt` and
   `lastActiveAt` are `BigInt!` for exactly this reason; using `Timestamp!` with a
   unix-seconds number fails with `date.toISOString is not a function`.

7. **`start_block` is baked into the checkpoint.** Changing it after data exists is
   rejected as an incompatible config change. Reset with `docker compose down -v`
   (or `envio start -r`) when you change it.

8. **Package `"type": "module"` is required** (envio v3 is ESM). It is correct to
   keep it; the earlier ESM failure was caused by a stale image built outside
   compose, not by this setting.

## Package versions

| Package | Version |
|---|---|
| `envio` | `^3.6.1` (resolves to 3.10.x) |
| `node` (image) | `24.3.0-slim` |
| `postgres` | `17.5` |
| `hasura/graphql-engine` | `v2.43.0` |

## Layout

```
indexer/
├── config.yaml            # HyperSync source (needs ENVIO_API_TOKEN)
├── config.rpc.yaml        # RPC source (token-free)
├── schema.graphql         # Agent, Incident, Challenge, ScoreSnapshot
├── src/EventHandlers.ts   # envio v3 handlers (indexer.onEvent)
├── abis/                  # ABIs extracted from contracts/out (forge artifacts)
├── tsconfig.json          # matches Envio's official example
├── envio-env.d.ts         # wires generated types into the `envio` module
├── Dockerfile
└── docker-compose.yaml
```

## Troubleshooting

```batch
docker compose logs envio-indexer --tail 50
docker compose ps
:: reset all indexed data and start over
docker compose down -v && docker compose up -d --build
```
