# web — Claimless dashboard

Minimal read-only Next.js (App Router + TypeScript + Tailwind) dashboard over the
deployed Claimless contracts on Monad testnet (10143). No backend, no API route,
no wallet, no write path: every number is a live `viem` public-client contract
read, rendered in the browser.

## Run

```
npm install
npm run dev     # http://localhost:3000
npm run build   # static export into out/
```

## Pages

| Route | Reads | Shows |
|---|---|---|
| `/` | `RiskScore.getScoreBundle`, `IncidentRegistry.getIncidentCount/getIncident`, `CoverPool.quotePremium`, ERC-8004 `ownerOf` | agent list, risk scores, quote (premium, maxCoverage, hadRecord, riskMultiplier), SILENT vs RECORD contrast |
| `/coverage` | `CoverPool.totalCapital/getCapacity/policyCount` (+ locked, premiums, constants), `ParametricTrigger.forwarder/triggerCount` | pool capital, trigger status, CRE forwarder story |

## Addresses

Addresses are read from `lib/deployments.json`, a copy of
`contracts/deployments/monad-testnet.json` (Next.js cannot import outside its
project root). If contracts are redeployed:

```
copy /Y contracts\deployments\monad-testnet.json web\lib\deployments.json
```

Do not hardcode addresses anywhere else.

## Honesty rules

- No mock data. If the RPC fails, the error is rendered instead of fake zeros.
- Agent ids shown are the small known set `[10182, 1867]`, matching the ERC-8004
  demo (`sdk/scripts/erc8004-demo.ts`). Verified live 2026-09-21: the only
  incident in the registry belongs to agent 77001 (severity 5, PENDING, challenge
  window open), so the accepted tally is 0 for both known agents and both are
  shown as SILENT with the punitive 5x / 10%-cap terms. When 10182's incident is
  finalized (or any new incident is accepted), the RECORD badge and better terms
  appear automatically — the contrast is whatever the chain says, not what we
  wish it said.