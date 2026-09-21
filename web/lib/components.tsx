"use client";

/** Shared presentational primitives. Plain Tailwind, no component library. */

import { bpsHuman, formatEther, multiplierHuman } from "./format";

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-[#d7e2ea]";
  return (
    <div className="rounded border border-[#1e2a35] bg-[#10161d] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b8299]">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 font-mono text-[10px] text-[#6b8299]">{sub}</div> : null}
    </div>
  );
}

export function ContractRef({ label, address, url }: { label: string; address: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[10px] text-[#6b8299] hover:text-emerald-300"
      title={address}
    >
      {label} <span className="text-[#8fa8bc]">{address.slice(0, 8)}…{address.slice(-6)}</span> ↗
    </a>
  );
}

/** The cold-start policy line, quoted from the CoverPool contract header. */
export function PolicyBanner() {
  return (
    <div className="rounded border border-[#1e2a35] bg-[#0d1218] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6b8299]">
        cold-start policy · priced, never rejected
      </div>
      <div className="mt-1 text-xs text-[#a9bccb]">
        An agent with <span className="text-amber-300 font-mono">no disclosed record</span> can still buy
        coverage, but pays a <span className="text-amber-300 font-mono">punitive premium multiplier</span> and a{" "}
        <span className="text-amber-300 font-mono">hard-capped coverage limit</span>. A disclosed record — even
        a bad one — unlocks better terms. That asymmetry is the incentive to report.
      </div>
      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px]">
        <span className="rounded border border-[#1e2a35] bg-[#10161d] px-2 py-0.5 text-[#8fa8bc]">
          on-chain constants, read live
        </span>
        <span className="text-[#6b8299]">
          NO_RECORD_MULTIPLIER = {multiplierHuman(50000n)} · NO_RECORD_MAX_BPS = {bpsHuman(1000)} of normal cap
        </span>
      </div>
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded border border-[#1e2a35] bg-[#10161d] p-4 font-mono text-xs text-[#6b8299]">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> {label}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-rose-900/60 bg-rose-950/30 p-4">
      <div className="font-mono text-xs font-semibold text-rose-300">RPC ERROR — showing nothing rather than fake zeros</div>
      <div className="mt-1 break-all font-mono text-[10px] text-rose-200/80">{message}</div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-2 rounded border border-rose-800 px-2 py-1 font-mono text-[10px] text-rose-200 hover:bg-rose-900/40"
        >
          retry read
        </button>
      ) : null}
    </div>
  );
}

export function Ether({ wei }: { wei: string }) {
  return (
    <span>
      {wei} <span className="text-[#6b8299]">MON</span>
    </span>
  );
}

export { formatEther };