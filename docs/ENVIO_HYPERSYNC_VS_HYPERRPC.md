# Envio: HyperSync vs HyperRPC — which do we use, and why

> Both are Envio products. This note records the decision so it is not re-debated.

## Short answer

**We use HyperSync** (via HyperIndex, which is what our `indexer/` is), and we do
**not** use HyperRPC.

## What each one actually is

| | **HyperSync** | **HyperRPC** |
|---|---|---|
| Product type | Raw blockchain data *streaming API* | Read-only JSON-RPC endpoint |
| Purpose | Fast, filterable bulk data access | Drop-in replacement for a normal node RPC |
| Interface | Its own query API (filters, field selection) | Standard Ethereum JSON-RPC (`eth_getLogs`, etc.) |
| Speed | Fastest | Up to ~5x a normal node, but **built on HyperSync** |
| Writes | N/A (data only) | **None** — read-only, cannot send transactions |
| Billing | Free tier via API token | **$4 per million calls, $1/month minimum** |
| Status | Mature | Under active development, **not formally audited** |
| Best for | Indexers, data pipelines, analytics | Existing RPC-based code that needs speed |

Envio's own docs are explicit:

> "For most use cases, we recommend using **HyperSync** over HyperRPC."
> "Behind the scenes, HyperRPC actually uses HyperSync to fulfill requests."
> "When to use HyperSync: when performance is critical, when you need advanced
> filtering capabilities, when you want more control over field selection, **for new
> projects where you're designing the data access layer**."

## How this maps to our stack

We have three separate data paths, and they should not be confused:

```
1. Contracts write to Monad           → Monad public RPC      (https://testnet-rpc.monad.xyz)
2. Indexer reads bulk historical logs → HyperSync via HyperIndex ("HyperIndex")
3. Dashboard/SDK read aggregates      → Hasura GraphQL        (http://localhost:8081/v1/graphql)
```

The indexer's `config.yaml` uses the HyperSync source. That is `indexer/`, which is
HyperIndex — the full indexing framework (schema, handlers, GraphQL) sitting on top of
HyperSync. This is exactly the "new project designing the data access layer" case, so
HyperSync is correct.

HyperRPC would only enter the picture if we needed a **standard RPC interface** with
better throughput than the public Monad RPC. We do not currently: our on-chain reads go
through Hasura (indexed) or the public RPC (deploy/verify), and neither is a bottleneck.

## Why not HyperRPC anyway

- **It costs money.** $4 per million calls with a $1 monthly minimum, versus the free
  HyperSync/HyperIndex development tier. This violates the no-money rule for no benefit.
- **It is redundant for us.** HyperRPC is a compatibility shim in front of HyperSync.
  Since we already consume HyperSync through HyperIndex, adding HyperRPC would be a
  second door into the same room.
- **It cannot write.** It is read-only, so it could never replace the public RPC for
  deploys or contract calls.

## Where our API token is used

`ENVIO_API_TOKEN` authenticates **HyperSync**. In our requests it goes in the
`Authorization: Bearer <token>` header.

> Verified: a HyperSync request with no `Authorization` header returns
> `Your token is malformed`. That message means "no token supplied", not "invalid
> token". With the header present, real `IncidentReported` logs come back.

HyperRPC, by contrast, takes the token **in the URL path**
(`https://<chain>.rpc.hypersync.xyz/<api-token>`) — a different convention. We do not
use it, so this difference does not affect us; it is recorded here only to prevent
confusion if someone copies a HyperRPC snippet by mistake.

## Decision record

| Question | Answer |
|---|---|
| Which Envio product do we use? | **HyperIndex** (the indexer), which reads via **HyperSync** |
| Do we use HyperRPC? | **No** |
| Why? | HyperSync is faster, free on the dev tier, and is what HyperIndex is designed around; HyperRPC is a paid read-only compatibility layer we do not need |
| Will that change? | Only if we later need a high-throughput standard JSON-RPC and the public Monad RPC becomes the bottleneck. Revisit at Week 3+ if the dashboard is slow |
