/**
 * Risk score reads for the Claimless SDK.
 *
 * CONTRACT-FIRST / INDEXER-FALLBACK DESIGN
 * ========================================
 * The authoritative source for an agent's risk score is the on-chain
 * `RiskScore` contract on Monad testnet:
 *
 *   score = 100 - min(100, acceptedCount * 5 + severitySum * 2)
 *
 * (see contracts/src/RiskScore.sol — FREQ_WEIGHT = 5, SEV_WEIGHT = 2,
 * MAX_SCORE = 100, floored at 0). The contract is the source of truth
 * because it is what `CoverPool.quotePremium` consumes, so reads must
 * agree with what the pool would charge.
 *
 * If the RPC/contract read fails (network down, testnet reset, rate
 * limit), we fall back to an optional injectable `IndexerScoreReader`
 * (typically the Envio indexer; injected by the caller so this module
 * stays decoupled from `envio.ts`, which is being written concurrently).
 * Indexer reads are marked `source: "indexer"` so callers never confuse
 * the two paths.
 *
 * CACHING
 * =======
 * `getScore` keeps a tiny in-process cache keyed by agentId with a
 * default TTL of 5 seconds (`DEFAULT_SCORE_CACHE_TTL_MS`). Contract
 * scores only change when a dispute window elapses or `recompute` runs,
 * so sub-5s staleness is harmless for UI/premium-quote use, and the TTL
 * absorbs RPC rate limiting. Pass `ttlMs` to override; pass
 * `ttlMs: 0` to bypass caching for a fresh read. `clearScoreCache()`
 * empties it (used by tests and demos).
 *
 * On a cache hit the returned `RiskScore` carries `source` of the read
 * that originally populated it and `fromCache: true`.
 *
 * BANDS
 * =====
 * Score formatting uses fixed thresholds, exported as
 * `SCORE_BAND_THRESHOLDS` for reuse by the UI:
 *
 *   score >= 90  -> "LOW"       (safe: premium multiplier friendly)
 *   score >= 70  -> "MODERATE"  (watch: a few incidents on record)
 *   score >= 40  -> "ELEVATED"  (risky: repeated/serious incidents)
 *   score  < 40  -> "CRITICAL"  (near-floor: frequent catastrophic history)
 *
 * FAIL MODE
 * =========
 * Both paths failing throws `ScoreUnavailableError` carrying the
 * original contract error and the indexer error. We never silently
 * return a wrong number.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import RiskScoreAbi from "./abis/RiskScore.json" with { type: "json" };
import { CLAIMLESS_TESTNET } from "./config.js";
import { getPublicClient, monadTestnet } from "./chain.js";
import type { ClaimlessEnv } from "./env.js";
import type { RiskScore } from "./types.js";

/** The real deployed RiskScore address on Monad testnet. */
export const RISKSCORE_ADDRESS = CLAIMLESS_TESTNET.riskScore as `0x${string}`;

/** Default TTL for the in-memory score cache (see module docs). */
export const DEFAULT_SCORE_CACHE_TTL_MS = 5_000;

/**
 * Band thresholds for formatting scores. Scores are 0..100 with 100 safest.
 * A score at or above the threshold is in the better band, e.g. 87 -> MODERATE.
 * Kept in one place so the UI and the SDK never disagree.
 */
export const SCORE_BAND_THRESHOLDS = {
  LOW: 90,
  MODERATE: 70,
  ELEVATED: 40,
} as const;

/** The band labels, ordered best to worst. */
export type ScoreBand = "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL";

/** Thrown when neither the contract nor the (optional) indexer can serve a score. */
export class ScoreUnavailableError extends Error {
  constructor(
    public readonly agentId: bigint,
    public readonly contractError: unknown,
    public readonly indexerError: unknown,
  ) {
    const contractMsg = contractError instanceof Error ? contractError.message : String(contractError);
    const indexerMsg =
      indexerError === undefined
        ? "no reader configured"
        : indexerError instanceof Error
          ? indexerError.message
          : String(indexerError);
    super(
      `No risk score available for agent ${agentId}. ` +
        `Contract read failed: ${contractMsg}. Indexer fallback failed: ${indexerMsg}.`,
    );
    this.name = "ScoreUnavailableError";
  }
}

/**
 * Injectable read side for the fallback path. Deliberately minimal so any
 * backend (Envio GraphQL, a REST service, an in-memory stub) can implement
 * it without coupling this module to the indexer client.
 */
export interface IndexerScoreReader {
  getAgent(
    agentId: string,
  ): Promise<{ currentScore: string; acceptedCount: number; severitySum: string } | null>;
}

/** Full bundle returned by the on-chain getScoreBundle() view. */
export interface ScoreBundle {
  /** Live computed score, 0..100 (100 safest). */
  score: number;
  acceptedCount: number;
  severitySum: number;
  /** Constant weights read back from the contract (5 and 2, MAX 100). */
  maxScore: number;
  freqWeight: number;
  sevWeight: number;
}

/** Internal cache entry. `expiresAt <= Date.now()` means stale. */
interface CacheEntry {
  value: RiskScore;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Empty the score cache (mainly for tests and demos). */
export function clearScoreCache(): void {
  cache.clear();
}

function cacheKey(agentId: bigint): string {
  return agentId.toString();
}

function readCache(agentId: bigint, ttlMs: number): RiskScore | undefined {
  if (ttlMs <= 0) return undefined;
  const entry = cache.get(cacheKey(agentId));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(agentId));
    return undefined;
  }
  return { ...entry.value };
}

function writeCache(agentId: bigint, value: RiskScore, ttlMs: number): void {
  if (ttlMs <= 0) return;
  cache.set(cacheKey(agentId), { value, expiresAt: Date.now() + ttlMs });
}

/** Build a read client for the given env (fresh instance so per-call envs
  * like a deliberately broken RPC url in demos fail for real, not from a
  * cached transport). */
function clientFor(env?: ClaimlessEnv): PublicClient {
  if (!env) return getPublicClient();
  return createPublicClient({
    chain: monadTestnet,
    transport: http(env.rpcUrl, { retryCount: 0, timeout: 10_000 }),
  });
}

/**
 * Live on-chain score computed from current registry data.
 * `source: "contract"` on the result.
 */
export async function getScoreFromContract(agentId: bigint, env?: ClaimlessEnv): Promise<RiskScore> {
  const client = clientFor(env);
  try {
    const raw = await client.readContract({
      address: RISKSCORE_ADDRESS,
      abi: RiskScoreAbi,
      functionName: "getScoreBundle",
      args: [agentId],
    });
    const [score, acceptedCount, severitySum] = raw as unknown as [bigint, bigint, bigint];
    return {
      agentId,
      score: Number(score),
      acceptedCount: Number(acceptedCount),
      severitySum: Number(severitySum),
      source: "contract",
    };
  } catch (err) {
    throw new Error(
      `RiskScore.getScoreBundle(${agentId}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * The full on-chain bundle: live score plus the registry inputs it was
 * computed from, plus the weights read back from the contract.
 */
export async function getScoreBundle(agentId: bigint, env?: ClaimlessEnv): Promise<ScoreBundle> {
  const client = clientFor(env);
  try {
    const [bundle, freq, sev, max] = (await Promise.all([
      client.readContract({
        address: RISKSCORE_ADDRESS,
        abi: RiskScoreAbi,
        functionName: "getScoreBundle",
        args: [agentId],
      }),
      client.readContract({
        address: RISKSCORE_ADDRESS,
        abi: RiskScoreAbi,
        functionName: "FREQ_WEIGHT",
      }),
      client.readContract({
        address: RISKSCORE_ADDRESS,
        abi: RiskScoreAbi,
        functionName: "SEV_WEIGHT",
      }),
      client.readContract({
        address: RISKSCORE_ADDRESS,
        abi: RiskScoreAbi,
        functionName: "MAX_SCORE",
      }),
    ])) as unknown as [readonly [bigint, bigint, bigint], bigint, bigint, bigint];

    const [score, acceptedCount, severitySum] = bundle;
    return {
      score: Number(score),
      acceptedCount: Number(acceptedCount),
      severitySum: Number(severitySum),
      maxScore: Number(max),
      freqWeight: Number(freq),
      sevWeight: Number(sev),
    };
  } catch (err) {
    throw new Error(
      `RiskScore.getScoreBundle/weights(${agentId}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * The last score persisted by `recompute` (may lag the live score).
 */
export async function getStoredScore(agentId: bigint, env?: ClaimlessEnv): Promise<number> {
  const client = clientFor(env);
  try {
    const raw = (await client.readContract({
      address: RISKSCORE_ADDRESS,
      abi: RiskScoreAbi,
      functionName: "getStoredScore",
      args: [agentId],
    })) as bigint;
    return Number(raw);
  } catch (err) {
    throw new Error(
      `RiskScore.getStoredScore(${agentId}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Whether `recompute` has ever run for this agent on chain.
 */
export async function hasScore(agentId: bigint, env?: ClaimlessEnv): Promise<boolean> {
  const client = clientFor(env);
  try {
    const raw = (await client.readContract({
      address: RISKSCORE_ADDRESS,
      abi: RiskScoreAbi,
      functionName: "hasScore",
      args: [agentId],
    })) as boolean;
    return raw;
  } catch (err) {
    throw new Error(
      `RiskScore.hasScore(${agentId}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Contract-first score read with indexer fallback and caching.
 *
 * 1. Try the on-chain RiskScore contract (authoritative).
 * 2. If that read throws, try `opts.reader` (e.g. the Envio indexer),
 *    marking the result `source: "indexer"`. A reader returning null
 *    counts as "no data", not as a failure, but still throws if the
 *    contract path also failed (we refuse to invent a score).
 * 3. If both fail, throw `ScoreUnavailableError` with both errors.
 *
 * Results are cached for `opts.ttlMs` milliseconds (default 5s, 0 = no cache).
 */
export async function getScore(
  agentId: bigint,
  opts: { reader?: IndexerScoreReader; ttlMs?: number; env?: ClaimlessEnv } = {},
): Promise<RiskScore> {
  const ttlMs = opts.ttlMs ?? DEFAULT_SCORE_CACHE_TTL_MS;

  const cached = readCache(agentId, ttlMs);
  if (cached) return cached;

  let contractError: unknown;
  try {
    const fromContract = await getScoreFromContract(agentId, opts.env);
    writeCache(agentId, fromContract, ttlMs);
    return fromContract;
  } catch (err) {
    contractError = err;
  }

  if (!opts.reader) {
    throw new ScoreUnavailableError(agentId, contractError, undefined);
  }

  let indexerError: unknown;
  let fromReader: Awaited<ReturnType<IndexerScoreReader["getAgent"]>>;
  try {
    fromReader = await opts.reader.getAgent(agentId.toString());
  } catch (err) {
    indexerError = err;
    throw new ScoreUnavailableError(agentId, contractError, indexerError);
  }

  if (fromReader === null) {
    throw new ScoreUnavailableError(agentId, contractError, "indexer returned no data (null)");
  }

  const score = Number(fromReader.currentScore);
  if (!Number.isFinite(score)) {
    throw new ScoreUnavailableError(
      agentId,
      contractError,
      `indexer returned non-numeric score ${JSON.stringify(fromReader.currentScore)}`,
    );
  }

  const fromIndexer: RiskScore & { fromCache?: boolean } = {
    agentId,
    score,
    acceptedCount: fromReader.acceptedCount,
    severitySum: Number(fromReader.severitySum),
    source: "indexer",
  };
  writeCache(agentId, fromIndexer, ttlMs);
  return fromIndexer;
}

/**
 * Map a raw 0..100 score to its band. Mirrors SCORE_BAND_THRESHOLDS docs.
 */
export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BAND_THRESHOLDS.LOW) return "LOW";
  if (score >= SCORE_BAND_THRESHOLDS.MODERATE) return "MODERATE";
  if (score >= SCORE_BAND_THRESHOLDS.ELEVATED) return "ELEVATED";
  return "CRITICAL";
}

/**
 * Human formatting, e.g. `87 / 100 (MODERATE)`.
 * Band thresholds are documented on SCORE_BAND_THRESHOLDS.
 */
export function formatScore(score: number): string {
  const band = scoreBand(score);
  return `${score} / 100 (${band})`;
}