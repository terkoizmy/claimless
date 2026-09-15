/**
 * Nansen enrichment for the Claimless SDK — credit-aware smart-money signal.
 *
 * Bounty target: "Best use of Nansen" ($5,000) — score enriched with
 * smart-money data beyond raw chain reads.
 *
 * ═══════════════════════════ Claimless ═════════════════════════════════════
 * API FACTS — VERIFIED against https://docs.nansen.ai on 2026-09-16
 * (sources: /getting-started/authentication.md,
 * /api/profiler/address-pnl-and-trade-performance.md, /api/smart-money.md,
 * /api/smart-money/netflows.md — the last three embed the OpenAPI schema)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Base URL: `https://api.nansen.ai`; all endpoints under `/api/v1/…`,
 *    POST with a JSON body.
 *  - Auth: HTTP header **`apikey: <NANSEN_API_KEY>`** (lowercase canonical
 *    form; docs explicitly say: "Ensure the header name is `apikey`").
 *    VERIFIED — matches the OpenAPI `securitySchemes.apiKeyAuth` on every
 *    endpoint schema (`"name": "apikey", "in": "header"`).
 *  - `POST /api/v1/profiler/address/pnl-summary` — body REQUIRES `chain`
 *    and `date` (`{from,to}` ISO-8601); optional `address` / `entity_name`.
 *    1 credit. Chain enum includes `"monad"`.
 *  - `POST /api/v1/smart-money/netflow` — body REQUIRES `chains` (array;
 *    `"all"` allowed). 5 credits. Chain enum includes `"monad"`.
 *  - Credit costs (VERIFIED in docs/sponsor-notes.md): pnl-summary = 1,
 *    smart-money/* = 5, token-screener = 1, tgm/holders = 5,
 *    `profiler/address/labels` = 100 — DISABLED by design below (one call
 *    consumes the entire 100-credit free trial).
 *  - Every priced response carries `X-Nansen-Credits-Used` /
 *    `X-Nansen-Credits-Remaining` response headers; the ledger records the
 *    exact `X-Nansen-Credits-Used` value on live calls and falls back to the
 *    documented cost table when the header is absent.
 *
 * Free-plan budget (VERIFIED): 100 trial credits, then a 10/day refill,
 * 15 req/s → 10 credits/day = 2 netflow calls/day. Caching is therefore not
 * optional: every read goes through a durable on-disk JSON cache
 * (`sdk/.cache/nansen/`, TTL 24h default) and a persisted credit ledger.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "./env.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Options accepted by every cached read. */
export interface NansenCallOptions {
  /** Skip the cache read and force a refresh (writes the fresh value back). */
  cache?: boolean;
  /** Per-call TTL override in milliseconds. */
  ttlMs?: number;
}

/** Aggregate PnL summary for one wallet (1 credit). */
export interface NansenAddressPnl {
  address: string;
  chain: string;
  /** ISO date (YYYY-MM-DD) the window starts at. */
  dateFrom: string;
  /** ISO date (YYYY-MM-DD) the window ends at. */
  dateTo: string;
  realizedPnlUsd: number;
  realizedPnlPercent: number;
  /** 0-1 fraction; multiply by 100 for percent. */
  winRate: number;
  tradedTokenCount: number;
  tradedTimes: number;
  topTokens: Array<{
    tokenSymbol: string;
    realizedPnl: number;
    realizedRoi: number;
    chain: string;
  }>;
}

/** One smart-money netflow row (part of the 5-credit netflow call). */
export interface NansenNetflowRow {
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  netFlow1hUsd: number;
  netFlow24hUsd: number;
  netFlow7dUsd: number;
  netFlow30dUsd: number;
  traderCount: number;
}

/** Smart-money netflow for the requested chains (5 credits). */
export interface NansenNetflow {
  chains: string[];
  rows: NansenNetflowRow[];
}

/** Reporter credibility weight derived from Nansen signals. */
export interface ReporterWeight {
  address: string;
  /** Clamped to [0.2, 1] — multiplies into incident-report weighting. */
  weight: number;
  /** Deterministic explanation of every factor that produced `weight`. */
  rationale: string[];
}

// ── Constants (all VERIFIED; change together with docs.nansen.ai) ───────────

/** Nansen API base URL. VERIFIED (OpenAPI `servers` on every endpoint). */
export const NANSEN_BASE_URL = "https://api.nansen.ai";

/** Auth header name. VERIFIED — docs insist on lowercase `apikey`. */
export const NANSEN_AUTH_HEADER = "apikey";

/** Free-plan trial credit budget. VERIFIED (docs/sponsor-notes.md). */
export const NANSEN_TRIAL_CREDITS = 100;

/** Daily refill on the free plan. VERIFIED. */
export const NANSEN_DAILY_REFILL = 10;

/** Warn once the ledger passes this fraction of the trial budget. */
const BUDGET_WARN_FRACTION = 0.9;

/**
 * Documented credit cost per method. VERIFIED in docs/sponsor-notes.md:
 * pnl-summary = 1, smart-money/* = 5, token-screener = 1, tgm/holders = 5,
 * profiler/address/labels = 100 (never call).
 */
export const CREDIT_COSTS: Readonly<Record<string, number>> = {
  "profiler/address/pnl-summary": 1,
  "smart-money/netflow": 5,
  "trading/any": 1,
  "token-screener": 1,
  "tgm/holders": 5,
  "profiler/address/labels": 100, // NEVER CALLED — guarded below.
};

/** Default cache TTL: 24 hours. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * PnL request window. The endpoint requires an explicit `date`; a trailing
 * 90-day window keeps the cache key stable across the day (no re-fetch churn)
 * while staying representative of recent trading behavior.
 */
const PNL_WINDOW_DAYS = 90;

// ── Cache + ledger persistence ──────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  method: string;
  params: Record<string, unknown>;
  /** Unix ms when the entry was written. */
  storedAt: number;
  /** TTL in ms that applies to this entry. */
  ttlMs: number;
  /** Credits the live fetch spent (0 for stubbed/degraded entries). */
  creditsSpent: number;
  data: T;
}

interface CreditLedger {
  calls: number;
  creditsSpent: number;
  byMethod: Record<string, number>;
  byMethodCredits: Record<string, number>;
}

const CACHE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache",
  "nansen",
);
const LEDGER_FILE_NAME = "ledger.json";
const LEDGER_FILE = path.join(CACHE_DIR, LEDGER_FILE_NAME);

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined; // missing, partial, or corrupt — treated as absent
  }
}

function writeJsonFile(file: string, value: unknown): void {
  ensureCacheDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

/** sha256 key over the method and a normalized (key-sorted) parameter tree. */
function cacheKey(method: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(params, (_k, v: unknown) =>
    v === undefined ? null : v,
  );
  return createHash("sha256").update(`${method}\n${normalized}`).digest("hex");
}

function cacheFile(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function loadEntry<T>(key: string, ttlMs: number): { entry: CacheEntry<T>; fresh: boolean } | undefined {
  const entry = readJsonFile<CacheEntry<T>>(cacheFile(key));
  if (!entry || entry.storedAt === undefined) return undefined;
  return { entry, fresh: Date.now() - entry.storedAt < ttlMs };
}

// ── Credit ledger ───────────────────────────────────────────────────────────

let budgetWarnedThisProcess = false;

function loadLedger(): CreditLedger {
  const stored = readJsonFile<CreditLedger>(LEDGER_FILE);
  if (stored && typeof stored.calls === "number") {
    return {
      calls: stored.calls,
      creditsSpent: stored.creditsSpent,
      byMethod: stored.byMethod ?? {},
      byMethodCredits: stored.byMethodCredits ?? {},
    };
  }
  return { calls: 0, creditsSpent: 0, byMethod: {}, byMethodCredits: {} };
}

function persistLedger(ledger: CreditLedger): void {
  try {
    writeJsonFile(LEDGER_FILE, ledger);
  } catch {
    // A full disk must never break an already-completed API call.
  }
}

function recordCredits(method: string, credits: number): void {
  if (credits <= 0) return;
  const ledger = loadLedger();
  ledger.calls += 1;
  ledger.creditsSpent += credits;
  ledger.byMethod[method] = (ledger.byMethod[method] ?? 0) + 1;
  ledger.byMethodCredits[method] = (ledger.byMethodCredits[method] ?? 0) + credits;
  persistLedger(ledger);
  if (
    !budgetWarnedThisProcess &&
    ledger.creditsSpent >= BUDGET_WARN_FRACTION * NANSEN_TRIAL_CREDITS
  ) {
    budgetWarnedThisProcess = true;
    console.warn(
      `[nansen] credit budget warning: ${ledger.creditsSpent}/${NANSEN_TRIAL_CREDITS} trial credits spent ` +
        `(${Math.round((ledger.creditsSpent / NANSEN_TRIAL_CREDITS) * 100)}%). ` +
        `Free plan refills only ${NANSEN_DAILY_REFILL}/day — prefer cached reads.`,
    );
  }
}

/** Snapshot of credit usage, suitable for dashboards and demos. */
export function getCreditUsage(): {
  calls: number;
  creditsSpent: number;
  byMethod: Record<string, number>;
} {
  const ledger = loadLedger();
  return {
    calls: ledger.calls,
    creditsSpent: ledger.creditsSpent,
    byMethod: { ...ledger.byMethodCredits },
  };
}

/**
 * Documented credit cost for a method id.
 * Unknown methods estimate 1 (the cheapest plausible cost) — never guess high.
 */
export function estimateCredits(method: string): number {
  return CREDIT_COSTS[method] ?? 1;
}

// ── Public cache API ────────────────────────────────────────────────────────

/** Cache statistics: entry count plus oldest/newest store timestamps. */
export function getCacheStats(): {
  entries: number;
  oldest: number | null;
  newest: number | null;
} {
  let entries = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  try {
    for (const name of fs.readdirSync(CACHE_DIR)) {
      if (!name.endsWith(".json") || name === LEDGER_FILE_NAME) continue;
      const entry = readJsonFile<CacheEntry>(path.join(CACHE_DIR, name));
      if (!entry || entry.storedAt === undefined) continue;
      entries += 1;
      oldest = oldest === null ? entry.storedAt : Math.min(oldest, entry.storedAt);
      newest = newest === null ? entry.storedAt : Math.max(newest, entry.storedAt);
    }
  } catch {
    // No cache dir yet.
  }
  return { entries, oldest, newest };
}

/** Delete every cached entry (the ledger is preserved — history must not lie). */
export function clearCache(): void {
  try {
    for (const name of fs.readdirSync(CACHE_DIR)) {
      if (name === LEDGER_FILE_NAME) continue;
      fs.rmSync(path.join(CACHE_DIR, name), { force: true });
    }
  } catch {
    // Nothing to clear.
  }
}

// ── HTTP core ───────────────────────────────────────────────────────────────

class NansenHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "NansenHttpError";
  }
}

interface FetchParams {
  method: string;
  params: Record<string, unknown>;
}

async function nansenPost(
  apiKey: string,
  { method, params }: FetchParams,
): Promise<{ data: unknown; creditsUsed: number }> {
  const url = `${NANSEN_BASE_URL}/api/v1/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [NANSEN_AUTH_HEADER]: apiKey,
    },
    body: JSON.stringify(params),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    let code: string | undefined;
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: unknown;
        message?: unknown;
        detail?: unknown;
      };
      if (typeof parsed.message === "string") message = parsed.message;
      else if (typeof parsed.detail === "string") message = parsed.detail;
      const err = parsed.error as { code?: unknown } | string | undefined;
      if (typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string") {
        code = (err as { code: string }).code;
      }
      if (code === undefined && typeof err === "string") code = err;
    } catch {
      // keep defaults
    }
    throw new NansenHttpError(response.status, code, `Nansen ${method} failed: ${message}`);
  }
  // Exact accounting from the response header, falling back to the documented table.
  const headerCredits = Number(response.headers.get("x-nansen-credits-used"));
  const creditsUsed =
    Number.isFinite(headerCredits) && headerCredits > 0
      ? headerCredits
      : estimateCredits(method);
  return { data: JSON.parse(bodyText) as unknown, creditsUsed };
}

// ── Cached fetch (the only path reads ever take) ────────────────────────────

async function cachedFetch<T>(
  apiKey: string | undefined,
  method: string,
  params: Record<string, unknown>,
  opts: { cache?: boolean; ttlMs?: number } = {},
): Promise<T> {
  const useCache = opts.cache !== false;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = cacheKey(method, params);
  if (useCache) {
    const hit = loadEntry<T>(key, ttlMs);
    if (hit && hit.fresh) return hit.entry.data;
  }
  if (!apiKey) {
    throw new Error(
      `Nansen is unconfigured: set NANSEN_API_KEY to call ${method} ` +
        `(${estimateCredits(method)} credit(s)). ` +
        "A cached entry for this exact query may still exist — refresh it with opts { cache: false }.",
    );
  }
  const { data, creditsUsed } = await nansenPost(apiKey, { method, params });
  recordCredits(method, creditsUsed);
  try {
    const entry: CacheEntry<T> = {
      method,
      params,
      storedAt: Date.now(),
      ttlMs,
      creditsSpent: creditsUsed,
      data: data as T,
    };
    writeJsonFile(cacheFile(key), entry);
  } catch {
    // Cache write failures must never lose a successful fetch.
  }
  return data as T;
}

// ── Normalizers (API → SDK types) ───────────────────────────────────────────

function isoDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

interface RawPnlSummary {
  realized_pnl_usd?: unknown;
  realized_pnl_percent?: unknown;
  win_rate?: unknown;
  traded_token_count?: unknown;
  traded_times?: unknown;
  top5_tokens?: Array<{
    token_symbol?: unknown;
    realized_pnl?: unknown;
    realized_roi?: unknown;
    chain?: unknown;
  }>;
}

function normalizePnl(
  address: string,
  chain: string,
  dateFrom: string,
  dateTo: string,
  raw: RawPnlSummary,
): NansenAddressPnl {
  return {
    address,
    chain,
    dateFrom,
    dateTo,
    realizedPnlUsd: num(raw.realized_pnl_usd),
    realizedPnlPercent: num(raw.realized_pnl_percent),
    winRate: num(raw.win_rate),
    tradedTokenCount: num(raw.traded_token_count),
    tradedTimes: num(raw.traded_times),
    topTokens: (raw.top5_tokens ?? []).map((t) => ({
      tokenSymbol: str(t.token_symbol),
      realizedPnl: num(t.realized_pnl),
      realizedRoi: num(t.realized_roi),
      chain: str(t.chain, chain),
    })),
  };
}

interface RawNetflowResponse {
  data?: Array<{
    chain?: unknown;
    token_address?: unknown;
    token_symbol?: unknown;
    net_flow_1h_usd?: unknown;
    net_flow_24h_usd?: unknown;
    net_flow_7d_usd?: unknown;
    net_flow_30d_usd?: unknown;
    trader_count?: unknown;
  }>;
}

function normalizeNetflow(chains: string[], raw: RawNetflowResponse): NansenNetflow {
  return {
    chains,
    rows: (raw.data ?? []).map((r) => ({
      chain: str(r.chain, "unknown"),
      tokenAddress: str(r.token_address),
      tokenSymbol: str(r.token_symbol),
      netFlow1hUsd: num(r.net_flow_1h_usd),
      netFlow24hUsd: num(r.net_flow_24h_usd),
      netFlow7dUsd: num(r.net_flow_7d_usd),
      netFlow30dUsd: num(r.net_flow_30d_usd),
      traderCount: num(r.trader_count),
    })),
  };
}

// ── Read functions ──────────────────────────────────────────────────────────

/** PnL summary for one address (1 credit; cached 24h by default). */
export async function getAddressPnl(
  address: string,
  opts: { cache?: boolean; ttlMs?: number; chain?: string; days?: number } = {},
): Promise<NansenAddressPnl> {
  const apiKey = readEnv().nansenApiKey;
  const chain = opts.chain ?? "monad";
  const days = opts.days ?? PNL_WINDOW_DAYS;
  const dateFrom = isoDay(days);
  const dateTo = isoDay(0);
  // The API requires chain+date; `address` scopes the summary to the wallet.
  const params: Record<string, unknown> = {
    chain,
    date: { from: dateFrom, to: dateTo },
    address,
  };
  const raw = await cachedFetch<RawPnlSummary>(
    apiKey,
    "profiler/address/pnl-summary",
    params,
    opts,
  );
  return normalizePnl(address, chain, dateFrom, dateTo, raw);
}

/** Smart-money netflow across chains (5 credits; cached 24h by default). */
export async function getSmartMoneyNetflow(
  { chains, opts }: { chains?: string[]; opts?: { cache?: boolean; ttlMs?: number } } = {},
): Promise<NansenNetflow> {
  const apiKey = readEnv().nansenApiKey;
  const resolvedChains = chains ?? ["monad"];
  const params: Record<string, unknown> = { chains: resolvedChains };
  const raw = await cachedFetch<RawNetflowResponse>(
    apiKey,
    "smart-money/netflow",
    params,
    opts ?? {},
  );
  return normalizeNetflow(resolvedChains, raw);
}

/**
 * DISABLED BY DESIGN: `profiler/address/labels` costs 100 credits — one call
 * consumes the entire 100-credit free trial. It must never be called from
 * Claimless. This function exists so the prohibition is explicit in code.
 */
export async function getAddressLabels(_address: string): Promise<never> {
  throw new Error(
    "getAddressLabels is disabled by design: profiler/address/labels costs 100 credits, " +
      "the entire Nansen free trial. One call burns the whole budget. " +
      "Use getAddressPnl (1 credit) or getSmartMoneyNetflow (5 credits) instead.",
  );
}

// ── Reporter weighting (the product integration) ────────────────────────────

/**
 * Weight range of a reporter's credibility multiplier. Documented clamp:
 * unconfigured/neutral = 0.5, strong positive signal ≈ 1.0, strong negative
 * signal ≈ 0.2. Never 0 (a report must always count for something) and never
 * above 1 (Nansen refines, it does not outrank, on-chain outcomes).
 */
export const REPORTER_WEIGHT_RANGE = { min: 0.2, neutral: 0.5, max: 1 } as const;

/** PnL magnitude buckets (USD realized PnL over the 90-day window). */
const PNL_BUCKETS: Array<{ min: number; tier: string; bonus: number }> = [
  { min: 1_000_000, tier: "≥$1M", bonus: +0.3 },
  { min: 100_000, tier: "≥$100k", bonus: +0.2 },
  { min: 10_000, tier: "≥$10k", bonus: +0.1 },
  { min: 0, tier: "≥$0", bonus: 0 },
  { min: -10_000, tier: "≥-$10k (slight loss)", bonus: -0.05 },
  { min: -Infinity, tier: "<-$10k (deep loss)", bonus: -0.15 },
];

/**
 * Deterministic reporter weight from Nansen signals.
 *
 * weight = clamp(0.5 + pnlBucketBonus, 0.2, 1.0)
 *
 * Works with NO api key: returns the neutral weight (0.5) with a rationale
 * explaining Nansen is unconfigured, so the product degrades gracefully
 * instead of throwing. With a key, spends 1 credit (cached 24h) per address.
 */
export async function reporterWeight({
  address,
  opts,
}: {
  address: string;
  opts?: { cache?: boolean; ttlMs?: number };
}): Promise<ReporterWeight> {
  if (!address) {
    return {
      address: "",
      weight: REPORTER_WEIGHT_RANGE.neutral,
      rationale: ["No reporter address supplied — neutral weight."],
    };
  }
  const env = readEnv();
  if (!env.nansenApiKey) {
    return {
      address,
      weight: REPORTER_WEIGHT_RANGE.neutral,
      rationale: [
        "NANSEN_API_KEY is not configured — Nansen signals unavailable.",
        `Neutral weight ${REPORTER_WEIGHT_RANGE.neutral} applied (no credit spent).`,
        "Configure NANSEN_API_KEY to enrich this weight with realized PnL.",
      ],
    };
  }
  let pnl: NansenAddressPnl;
  try {
    pnl = await getAddressPnl(address, opts);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      address,
      weight: REPORTER_WEIGHT_RANGE.neutral,
      rationale: [
        `Nansen PnL lookup failed (${reason}).`,
        `Neutral weight ${REPORTER_WEIGHT_RANGE.neutral} applied.`,
      ],
    };
  }
  const bucket = PNL_BUCKETS.find((b) => pnl.realizedPnlUsd >= b.min) ?? PNL_BUCKETS[PNL_BUCKETS.length - 1];
  const weight = Math.min(
    REPORTER_WEIGHT_RANGE.max,
    Math.max(REPORTER_WEIGHT_RANGE.min, REPORTER_WEIGHT_RANGE.neutral + bucket.bonus),
  );
  return {
    address,
    weight,
    rationale: [
      `Realized PnL over the last 90d: $${pnl.realizedPnlUsd.toFixed(2)} ` +
        `(bucket ${bucket.tier}, bonus ${bucket.bonus >= 0 ? "+" : ""}${bucket.bonus}).`,
      `Win rate ${(pnl.winRate * 100).toFixed(1)}% across ${pnl.tradedTimes} sales ` +
        `on ${pnl.tradedTokenCount} tokens (chain: ${pnl.chain}).`,
      `Deterministic formula: clamp(0.5 + bucketBonus, ` +
        `${REPORTER_WEIGHT_RANGE.min}, ${REPORTER_WEIGHT_RANGE.max}) = ${weight.toFixed(2)}.`,
      pnl.topTokens.length > 0
        ? `Top token: ${pnl.topTokens[0].tokenSymbol} (${
            pnl.topTokens[0].realizedPnl >= 0 ? "+" : ""
          }$${pnl.topTokens[0].realizedPnl.toFixed(2)} realized).`
        : "No profitable tokens on record.",
    ],
  };
}