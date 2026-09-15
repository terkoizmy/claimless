# Claimless Indexer (Envio HyperIndex)

Indexes `IncidentRegistry` and `RiskScore` on **Monad testnet (chain 10143)** and
serves the data as GraphQL (Hasura), so the dashboard and `sdk/src/envio.ts` read
aggregates without any on-chain calls.

## Files

| File | Purpose |
|---|---|
| `config.yaml` | HyperSync data source (default; needs `ENVIO_API_TOKEN`) |
| `config.rpc.yaml` | RPC data source (token-free; needs `MONAD_RPC_URL`) |
| `schema.graphql` | Entities: `Agent`, `Incident`, `Challenge`, `ScoreSnapshot` |
| `src/EventHandlers.ts` | Handlers for the 5 indexed events |
| `docker-compose.yaml` | Self-hosted stack: postgres + hasura + indexer |
| `Dockerfile` | Indexer container image |
| `.env.example` | All environment variables, documented |

## Prerequisites

- **Node.js v22+** (`node -v`) — required by `envio@^2.x`
- **pnpm** (`npm i -g pnpm` or `corepack enable`)
- **Docker** — only for the self-hosted stack / `envio dev` services
- Contract addresses for Monad testnet (see `contracts/deployments/monad-testnet.json`;
  `incidentRegistry` and `riskScore` are `null` until `script/Deploy.s.sol` runs)

## Indexed events (copied from the Solidity source)

From `contracts/src/interfaces/IIncidentRegistry.sol`:

```solidity
event IncidentReported(uint256 indexed agentId, uint256 indexed incidentId, bytes32 kind, uint8 severity, address indexed reporter);
event IncidentChallenged(uint256 indexed incidentId, address indexed challenger);
event IncidentFinalized(uint256 indexed incidentId, bool accepted);
event ChallengeResolved(uint256 indexed incidentId, bool reportStands, address winner);
```

From `contracts/src/RiskScore.sol`:

```solidity
event ScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);
```

## Data source: HyperSync (default) vs RPC (token-free)

**Path A — HyperSync (default, recommended).** Monad testnet 10143 is natively
supported by HyperSync (`https://10143.hypersync.xyz`), so historical sync is
very fast and needs no RPC.

1. Get a free API token: open **https://envio.dev/app/api-tokens**, sign in,
   create a token, copy it.
2. Put it in `.env` as `ENVIO_API_TOKEN=...`.
3. Use `CONFIG_FILE=config.yaml` (the default).

**Path B — RPC (token-free).** If you do not want a token at all:

1. Set `MONAD_RPC_URL` (defaults to `https://testnet-rpc.monad.xyz`).
2. Set `CONFIG_FILE=config.rpc.yaml` — that config declares `rpc_config`, which
   tells HyperIndex to use the RPC as the sync source instead of HyperSync.

Note: there is **no `ENVIO_USE_RPC` switch** in Envio's runtime env vars. The
supported way to pick the sync source is which `CONFIG_FILE` you run (the
`rpc_config` block in `config.rpc.yaml` is what flips the data source). Both
configs index identical events with identical handlers; only the fetch layer
differs, and RPC sync is slower and rate-limited.

## Run locally (`envio dev`, managed Docker)

```bash
cd indexer
cp .env.example .env
# fill INCIDENT_REGISTRY_ADDRESS / RISK_SCORE_ADDRESS (after deploy) and
# ENVIO_API_TOKEN (Path A) or MONAD_RPC_URL + CONFIG_FILE=config.rpc.yaml (Path B)

pnpm install
pnpm envio codegen
pnpm envio dev          # starts postgres+hasura, indexes, serves GraphQL
```

`envio dev` uses `ENVIO_PG_PORT` for its local Postgres; `.env.example` sets
**5433** so it cannot collide with the Postgres already on **5432** on this
machine (container `agentic-scraper-postgres` and a local Postgres).

## Self-hosted (docker compose)

```bash
cd indexer
cp .env.example .env          # fill contract addresses + token/RPC choice
docker compose up -d --build
```

### Ports used (this machine)

| Service | Host port | Container port | Note |
|---|---|---|---|
| Postgres | **5433** | 5432 | 5432 is taken by `agentic-scraper-postgres` + local Postgres — do not remap |
| Hasura | **8081** | 8080 | 8080 may be taken; console at http://localhost:8081/console |
| Indexer metrics/health | 9898 | 9898 | bound to `127.0.0.1` |

Inside the compose network services talk on their standard ports (postgres
5432, hasura 8080); only host mappings are shifted.

## Verify data

```bash
# GraphQL endpoint (self-hosted):
curl http://localhost:8081/v1/graphql \
  -H 'x-hasura-admin-secret: testing' \
  -H 'content-type: application/json' \
  -d '{"query":"{ Agent { id incidentCount acceptedCount severitySum currentScore } Incident(limit: 5, orderBy: {id: desc}) { id severity status reporter } }"}'
```

The `raw_events` table (enabled via `raw_events: true`) is also available
through Hasura for debugging.

## Schema highlights (dashboard-facing aggregates)

`Agent` carries derived fields so the UI does not need on-chain calls:
`incidentCount`, `acceptedCount`, `rejectedCount`, `pendingCount`, `severitySum`
(sum of severity over accepted incidents, mirroring
`IncidentRegistry.getAcceptedSeveritySum`), `avgSeverity`, and `currentScore`
(last `RiskScore.ScoreUpdated` value).

## Uncertainties / notes

- `envio@^2.0.0` resolves to the latest 2.x (`2.32.6` at scaffold time, per
  npm dist-tags; 3.x is the current major). If the pin fails to install or
  codegen, note the error and re-pin deliberately (e.g. `^2.32.0`, or migrate
  to `^3.0.0` following https://docs.envio.dev/docs/HyperIndex/migrate-to-v3).
- Contract addresses are intentionally unresolved until `Deploy.s.sol`
  broadcasts; `codegen` works without them (config interpolation is textual),
  but `envio dev/start` requires them set.
- Handler code targets the V2 generated-API (`IncidentRegistry.X.handler`,
  `context.Entity.get/set`, `event.stake` as `BigInt`-decoded `msg.value`).
- Ports can be overridden via `ENVIO_PG_PORT` / `HASURA_EXTERNAL_PORT`, but
  keep 5433/8081 on this machine (see the port rule above).