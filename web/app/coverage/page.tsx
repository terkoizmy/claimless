"use client";

/**
 * Pool + trigger status. All values are live reads from Monad testnet
 * contracts via viem. No backend, no wallet, no mocks: a failing RPC renders
 * the error, never zeros.
 */

import { useCallback, useEffect, useState } from "react";
import { getPublicClient } from "@/lib/chain";
import { coverPoolAbi, parametricTriggerAbi } from "@/lib/abi";
import { ADDRESSES, RPC_URL } from "@/lib/deployments";
import { ContractRef, ErrorPanel, LoadingPanel, Stat } from "@/lib/components";
import { formatEther, shortAddress } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/format";

interface CoverageData {
  totalCapital: bigint;
  lockedCapital: bigint;
  capacity: bigint;
  policyCount: bigint;
  premiumsCollected: bigint;
  noRecordMultiplierFp: bigint;
  normalCapacityBps: bigint;
  triggerForwarder: string;
  triggerCount: bigint;
}

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 260 ? `${msg.slice(0, 257)}…` : msg;
}

export default function CoveragePage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const client = getPublicClient();

      // Fire the reads in one batch; any failure fails the page explicitly.
      const [totalCapital, lockedCapital, capacity, policyCount, premiumsCollected, noRecordMultiplierFp, normalCapacityBps, triggerForwarder, triggerCount] =
        (await Promise.all([
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "totalCapital" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "lockedCapital" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "getCapacity" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "policyCount" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "premiumsCollected" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "NO_RECORD_MULTIPLIER" }),
          client.readContract({ address: ADDRESSES.coverPool, abi: coverPoolAbi, functionName: "NORMAL_MAX_CAPACITY_BPS" }),
          client.readContract({ address: ADDRESSES.parametricTrigger, abi: parametricTriggerAbi, functionName: "forwarder" }),
          client.readContract({ address: ADDRESSES.parametricTrigger, abi: parametricTriggerAbi, functionName: "triggerCount" }),
        ])) as unknown as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          string,
          bigint,
        ];

      setData({
        totalCapital,
        lockedCapital,
        capacity,
        policyCount,
        premiumsCollected,
        noRecordMultiplierFp,
        normalCapacityBps,
        triggerForwarder,
        triggerCount,
      });
      setError(null);
    } catch (err) {
      setError(shortError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm font-semibold tracking-wider text-[#d7e2ea]">COVERAGE · POOL + TRIGGER STATUS</h1>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="rounded border border-[#1e2a35] px-2 py-1 font-mono text-[10px] text-[#8fa8bc] hover:bg-[#10161d] disabled:opacity-40"
        >
          {refreshing ? "refreshing…" : "refresh reads"}
        </button>
      </div>

      {error ? <div className="mt-4"><ErrorPanel message={error} onRetry={() => load(true)} /></div> : null}
      {loading ? (
        <div className="mt-4">
          <LoadingPanel label="reading CoverPool · ParametricTrigger on chain 10143…" />
        </div>
      ) : null}

      {data ? (
        <>
          <section className="mt-4">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#6b8299]">CoverPool — underwriter capital</h2>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="totalCapital"
                value={<>{formatEther(data.totalCapital)} <span className="text-xs text-[#6b8299]">MON</span></>}
                sub="underwriter deposits backing policies"
              />
              <Stat
                label="getCapacity"
                value={<>{formatEther(data.capacity)} <span className="text-xs text-[#6b8299]">MON</span></>}
                sub="totalCapital − lockedCapital"
              />
              <Stat
                label="lockedCapital"
                value={<>{formatEther(data.lockedCapital)} <span className="text-xs text-[#6b8299]">MON</span></>}
                sub="committed to active policies"
              />
              <Stat
                label="policyCount"
                value={data.policyCount.toString()}
                sub="policies ever purchased"
              />
              <Stat
                label="premiumsCollected"
                value={<>{formatEther(data.premiumsCollected)} <span className="text-xs text-[#6b8299]">MON</span></>}
                sub="premiums held, not yet paid out"
              />
              <Stat
                label="NO_RECORD_MULTIPLIER"
                value={<span className="text-amber-300">{Number(data.noRecordMultiplierFp) / 10_000}x</span>}
                sub="premium penalty for silence"
              />
              <Stat
                label="NORMAL_MAX_CAPACITY_BPS"
                value={Number(data.normalCapacityBps) / 100 + "%"}
                sub="normal per-policy cap, bps of capacity"
              />
              <Stat
                label="chain · RPC"
                value={<span className="text-xs">10143</span>}
                sub={<span title={RPC_URL}>{shortAddress(RPC_URL)}</span>}
              />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#6b8299]">ParametricTrigger — payout orchestration</h2>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="triggerCount"
                value={data.triggerCount.toString()}
                sub="registered payout conditions"
              />
              <Stat
                label="no voting · no committee"
                value={<span className="text-xs text-emerald-300">payout is parametric</span>}
                sub="condition: score ≤ threshold, evaluated by data"
              />
              <Stat
                label="policyCount"
                value={data.policyCount.toString()}
                sub="policies ever purchased"
              />
            </div>
          </section>

          <section className="mt-6 rounded border border-[#1e2a35] bg-[#0d1218] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#6b8299]">
              CRE forwarder — the only address that can deliver a payout report
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="break-all rounded bg-[#10161d] px-2 py-1 font-mono text-xs text-emerald-300">
                {data.triggerForwarder}
              </code>
              <a
                href={explorerAddressUrl(data.triggerForwarder)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-[#6b8299] hover:text-emerald-300"
              >
                view on explorer ↗
              </a>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-[#a9bccb]">
              <span className="text-[#d7e2ea]">ParametricTrigger.forwarder</span> is Chainlink&apos;s KeystoneForwarder
              for this chain. <code className="font-mono text-[#d7e2ea]">onReport(bytes,bytes)</code> accepts calls
              from this address only — any other caller is rejected with{" "}
              <code className="font-mono">NotForwarder()</code>. That is what makes &ldquo;no single party decides&rdquo; true
              rather than aspirational: the condition is re-derived on-chain from live contract state, and the report
              is only a signal to evaluate.
            </p>
            <div className="mt-3 font-mono text-[10px] text-[#6b8299]">
              forwarder (on-chain) == {data.triggerForwarder} · read live from ParametricTrigger
            </div>
          </section>

          <div className="mt-4 rounded border border-[#1e2a35] bg-[#0d1218] p-3 font-mono text-[10px] text-[#6b8299]">
            contracts (addresses read from contracts/deployments/monad-testnet.json):
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <ContractRef label="CoverPool" address={ADDRESSES.coverPool} url={explorerAddressUrl(ADDRESSES.coverPool)} />
              <ContractRef label="ParametricTrigger" address={ADDRESSES.parametricTrigger} url={explorerAddressUrl(ADDRESSES.parametricTrigger)} />
              <ContractRef label="CRE forwarder" address={ADDRESSES.creForwarder} url={explorerAddressUrl(ADDRESSES.creForwarder)} />
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}