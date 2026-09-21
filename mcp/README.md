# claimless-mcp

MCP server exposing the Claimless on-chain agent-risk layer (Monad testnet, chain 10143) to any MCP client.

**Why it exists** (docs/COLDSTART_DISTRIBUTION_STRATEGY.md): ERC-8004 has ~828,000 agents registered and essentially zero reputation feedback. Reporting currently requires custom integration; this server removes that cause - if the tool is one line to install, reporting stops needing bespoke work.

The three READ tools are useful **before anyone has reported anything**: they expose ERC-8004 identity, reputation, and risk lookups that already exist on-chain, so the server has value on day one even with a near-empty incident registry.

## Install (one line for an MCP client)

```json
{
  "mcpServers": {
    "claimless": {
      "command": "npx",
      "args": ["-y", "@terkoiz/claimless-mcp"]
    }
  }
}
```

Or run from this directory: `node dist/index.js` (after `npm install && npm run build`).

## Tools (exactly four)

| Tool | Type | What it does |
|---|---|---|
| `get_agent_identity` | read | Resolve ERC-8004 identity for an agentId: owner, agentWallet, tokenURI (canonical IdentityRegistry). |
| `get_agent_risk` | read | Live `RiskScore.getScoreBundle` (score/band), accepted incident count, severity sum, ERC-8004 reputation summary for tag `claimless:incident`. |
| `list_incidents` | read | Incident history for an agentId: id, kind (bytes32 + canonical name when known), severity, evidenceHash, stake, reporter, status, challenge deadline. |
| `report_incident` | **write** | **SPENDS FUNDS and submits a transaction.** Staked `IncidentRegistry.reportIncident` from `MONAD_PRIVATE_KEY`. Defaults to `dry_run=true`; pass `dry_run=false` to actually send. |

`report_incident` is marked `destructiveHint: true, readOnlyHint: false` and its description warns that it spends funds. The stake is bonded: a report disproven by a challenge loses it.

## Configuration

| Env var | Required | Default |
|---|---|---|
| (none) | no | Read tools work with zero configuration. |
| `MONAD_RPC_URL` | no | `https://testnet-rpc.monad.xyz` |
| `MONAD_PRIVATE_KEY` | only for `report_incident` | absent - write tool fails with a clear message |
| `CLAIMLESS_DEPLOYMENTS_FILE` | no | walks up from the module dir to `contracts/deployments/monad-testnet.json` |

Contract addresses are read from `contracts/deployments/monad-testnet.json` at runtime, never hardcoded. Bundled fallback addresses exist only so an installed npm package still resolves.

## Verify locally

```sh
cd mcp
npm install
npm run build
npm run list-tools   # exactly 4 tools
npm run smoke        # real stdio session: lists tools, calls all 4 with real chain reads
```

## Publish (later human step, not automated)

```sh
npm publish --access public
mcp-publisher login github
mcp-publisher publish
```

`package.json` carries `"mcpName": "io.github.terkoiz/claimless"`, matching `server.json`'s `name`, per the Official MCP Registry verification handshake.