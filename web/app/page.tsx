"use client";

/**
 * Agent list + risk scores. All values are live reads from Monad testnet
 * contracts (viem publicClient). No backend, no API route, no wallet, no mocks.
 */

import Link from "next/link";
import { useAgents, type AgentRow } from "@/lib/useAgents";
import { ContractRef, ErrorPanel, LoadingPanel, PolicyBanner } from "@/lib/components";
import { explorerAddressUrl, kindName, shortAddress, severityName } from "@/lib/format";
import { ADDRESSES, FEATURED_AGENT_ID, QUOTE_AMOUNT } from "@/lib/deployments";

function RecordBadge({ hasRecord }: { hasRecord: boolean }) {
  return hasRecord ? (
    <span className="rounded border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
      RECORD
    </span>
  ) : (
    <span className="rounded border border-amber-800 bg-amber-950/50 px-2 py-0.5 font-mono text-[10px] text-amber-300">
      SILENT
    </span>
  );
}

function AgentCard({ row, featured }: { row: AgentRow; featured: boolean }) {
  return (
    <div
      className={`rounded border p-4 ${
        featured ? "border-amber-800/60 bg-[#131a13]" : "border-[#1e2a35] bg-[#10161d]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-base font-bold text-[#d7e2ea]">agent #{row.agentId.toString()}</span>
          <RecordBadge hasRecord={row.hasRecord} />
          {featured ? (
            <span className="rounded border border-[#3a2f12] bg-[#1a1408] px-2 py-0.5 font-mono text-[10px] text-amber-200/80">
              CRE WATCHED
            </span>
          ) : null}
          {row.erc8004Status === "owner" ? (
            <span
              className="font-mono text-[10px] text-[#6b8299]"
              title={`ERC-8004 owner: ${row.erc8004Owner ?? ""}`}
            >
              ERC-8004 ✓ owner {row.erc8004Owner ? shortAddress(row.erc8004Owner) : ""}
            </span>
          ) : row.erc8004Status === "not_registered" ? (
            <span className="font-mono text-[10px] text-[#6b8299]">ERC-8004 · not registered</span>
          ) : null}
        </div>
        <a
          href={explorerAddressUrl(ADDRESSES.erc8004Identity)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-[#6b8299] hover:text-emerald-300"
        >
          identity ↗
        </a>
      </div>

      {/* Score block: the single number a disclosed agent is judged on. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded bg-[#0d1218] p-3">
          <div className="font-mono text-[10px] uppercase text-[#6b8299]">risk score</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold ${
              row.score >= 90 ? "text-emerald-300" : row.score >= 60 ? "text-amber-300" : "text-rose-300"
            }`}
          >
            {row.score}
            <span className="text-xs text-[#6b8299]">/100</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6b8299]">
            100 − accepted·5 − severitySum·2
          </div>
        </div>
        <div className="rounded bg-[#0d1218] p-3">
          <div className="font-mono text-[10px] uppercase text-[#6b8299]">accepted incidents</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#d7e2ea]">{row.acceptedCount}</div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6b8299]">
            {row.incidentCount} reported · severity sum {row.severitySum}
          </div>
        </div>
        <div className="rounded bg-[#0d1218] p-3">
          <div className="font-mono text-[10px] uppercase text-[#6b8299]">premium multiplier</div>
          <div className={`mt-1 font-mono text-2xl font-bold ${row.hasRecord ? "text-emerald-300" : "text-amber-300"}`}>
            {row.riskMultiplier}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6b8299]">
            from CoverPool.quotePremium
          </div>
        </div>
        <div className="rounded bg-[#0d1218] p-3">
          <div className="font-mono text-[10px] uppercase text-[#6b8299]">max coverage</div>
          <div className={`mt-1 font-mono text-2xl font-bold ${row.hasRecord ? "text-emerald-300" : "text-amber-300"}`}>
            {row.maxCoverage}
            <span className="text-xs text-[#6b8299]"> MON</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6b8299]">
            {row.hasRecord ? "normal cap" : "hard-capped 10% of normal"}
          </div>
        </div>
      </div>

      {/* The cost of silence, stated in numbers. */}
      <div className="mt-3 rounded bg-[#0d1218] p-3 font-mono text-[11px] leading-5">
        <span className="text-[#6b8299]">quote for </span>
        {QUOTE_AMOUNT === 10n ** 18n ? "1.000" : (Number(QUOTE_AMOUNT) / 10 ** 18).toFixed(3)} MON · 30 days:{" "}
        <span className={row.hasRecord ? "text-emerald-300" : "text-amber-300"}>
          premium {row.premium} MON
        </span>
        <span className="text-[#6b8299]"> · multiplier {row.riskMultiplier}</span>
        {!row.hasRecord && (
          <>
            <span className="text-[#6b8299]"> · </span>
            <span className="text-amber-300">
              coverage hard-capped to {row.maxCoverage} MON
            </span>
            <span className="text-[#6b8299]"> (normal cap {row.poolNormalCap} MON)</span>
          </>
        )}
        {row.hasRecord && (
          <span className="text-[#6b8299]">
            {" "}
            · normal per-policy cap {row.poolNormalCap} MON
          </span>
        )}
      </div>

      {/* What disclosure would buy, at this exact score. Counterfactual, but
          every input is an on-chain read (multiplierForScore + pool constants). */}
      {!row.hasRecord && (
        <div className="mt-2 rounded border border-emerald-900/50 bg-[#0c1512] p-3 font-mono text-[11px] leading-5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-500/80">
            if recorded ·
          </span>{" "}
          <span className="text-[#a9bccb]">
            disclose the same record at score {row.score} and the pool prices you at{" "}
          </span>
          <span className="text-emerald-300">{row.counterfactualMultiplier}</span>
          <span className="text-[#6b8299]"> (vs {row.riskMultiplier} now) with a cap of </span>
          <span className="text-emerald-300">{row.poolNormalCap} MON</span>
          <span className="text-[#6b8299]"> (vs {row.maxCoverage} MON now). Silence costs 5x premium and 90% of your coverage.</span>
        </div>
      )}

      {row.firstIncident ? (
        <div className="mt-3 rounded border border-[#1e2a35] bg-[#0d1218] p-3 font-mono text-[11px] text-[#8fa8bc]">
          <span className="text-[#6b8299]">incident on record: </span>
          {kindName(row.firstIncident.kind)} · severity {row.firstIncident.severity} ({severityName(row.firstIncident.severity)}) ·
          status {row.firstIncident.status} · stake {row.firstIncident.stake} MON · evidence{" "}
          <span title={row.firstIncident.evidenceHash}>{row.firstIncident.evidenceHash.slice(0, 10)}…</span>
        </div>
      ) : null}
    </div>
  );
}

export default function AgentsPage() {
  const { rows, error, loading, refreshing, reload } = useAgents();

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm font-semibold tracking-wider text-[#d7e2ea]">AGENTS · LIVE READ</h1>
        <button
          onClick={reload}
          disabled={refreshing || loading}
          className="rounded border border-[#1e2a35] px-2 py-1 font-mono text-[10px] text-[#8fa8bc] hover:bg-[#10161d] disabled:opacity-40"
        >
          {refreshing ? "refreshing…" : "refresh reads"}
        </button>
      </div>

      <div className="mt-3">
        <PolicyBanner />
      </div>

      {error ? <ErrorPanel message={error} onRetry={reload} /> : null}
      {loading ? <LoadingPanel label="reading IncidentRegistry · RiskScore · CoverPool on chain 10143…" /> : null}

      {rows ? (
        <div className="mt-4 space-y-4">
          {rows.map((row) => (
            <AgentCard key={row.agentId.toString()} row={row} featured={row.agentId === FEATURED_AGENT_ID} />
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded border border-[#1e2a35] bg-[#0d1218] p-3 font-mono text-[10px] text-[#6b8299]">
        contracts (addresses read from contracts/deployments/monad-testnet.json):
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <ContractRef label="IncidentRegistry" address={ADDRESSES.incidentRegistry} url={explorerAddressUrl(ADDRESSES.incidentRegistry)} />
          <ContractRef label="RiskScore" address={ADDRESSES.riskScore} url={explorerAddressUrl(ADDRESSES.riskScore)} />
          <ContractRef label="CoverPool" address={ADDRESSES.coverPool} url={explorerAddressUrl(ADDRESSES.coverPool)} />
          <ContractRef label="ERC-8004 IdentityRegistry" address={ADDRESSES.erc8004Identity} url={explorerAddressUrl(ADDRESSES.erc8004Identity)} />
        </div>
      </div>

      <div className="mt-4">
        <Link href="/coverage/" className="font-mono text-xs text-emerald-300 hover:text-emerald-200">
          → coverage: pool + trigger status
        </Link>
      </div>
    </main>
  );
}