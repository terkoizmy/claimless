/**
 * Aurora Intents integration (any-chain deposits), powered by NEAR Intents.
 *
 * Two API surfaces exist:
 *
 *  1. The 1Click API (`https://1click.chaindefuser.com`, NEAR's own surface).
 *     Works with NO API key. `dry: true` quotes cost nothing and are what the
 *     demo uses. This is the default surface of this module.
 *
 *  2. The Aurora-branded surface (`https://intents-api.aurora.dev/api/...`),
 *     which routes through the same protocol but requires an app key from
 *     `studio.aurora.dev` (the key is not confidential). Set `useAuroraApi:
 *     true` and provide AURORA_INTENTS_APP_KEY to use it.
 *
 * Verified constraints (docs/AURORA_INTENTS_IMPLEMENTATION.md sections 12-15):
 *
 *  - Aurora Intents has NO testnet and never will. Every quote below is a
 *    mainnet-asset quote; the demo path uses `dry: true` so no funds move.
 *  - Testnet faucet USDC (Monad testnet / NEAR testnet) CANNOT be routed
 *    through Intents: testnet assets are absent from the registry by design.
 *    Never pass MONAD_TESTNET_USDC (config.ts) as an origin/destination asset.
 *  - No balance on the Aurora chain is ever needed; "Aurora Intents" is a
 *    routing layer, not a chain we transact on.
 *  - Status endpoint documented values (all handled below):
 *      PENDING_DEPOSIT    - awaiting deposit
 *      KNOWN_DEPOSIT_TX   - deposit detected
 *      PROCESSING         - swap executing
 *      SUCCESS            - tokens delivered
 *      INCOMPLETE_DEPOSIT - deposit below required amount
 *      REFUNDED           - failed, funds returned
 *      FAILED             - error
 *
 * Asset ids are REGISTRY ids (`nep141:...` / `nep245:...`), never raw token
 * addresses. The two used by Claimless:
 *  - origin:      Base USDC  (USDC on Base mainnet, 6 decimals)
 *  - destination: Monad USDC (USDC on Monad mainnet via omni.hot.tg, 6 decimals)
 */

import { readEnv, MissingConfigError, type ClaimlessEnv } from "./env.js";

/** USDC on Base mainnet (registry asset id, 6 decimals). */
export const BASE_USDC_ASSET_ID =
  "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near" as const;

/** USDC on Monad mainnet as seen by NEAR Intents (registry asset id, 6 decimals). */
export const MONAD_USDC_ASSET_ID =
  "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx" as const;

/** USDC uses 6 decimals on Base and on Monad. */
export const USDC_DECIMALS = 6 as const;

/** Default slippage tolerance: 100 bps = 1%. */
const DEFAULT_SLIPPAGE_TOLERANCE_BPS = 100;

/** Default quote deadline: 3 minutes from request time. */
const DEFAULT_DEADLINE_MS = 3 * 60 * 1000;

/** Fetch timeout for every call in this module. */
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One entry of GET /v0/tokens (the NEAR Intents asset registry). */
export interface IntentToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  priceUpdatedAt?: string;
  contractAddress?: string;
  coingeckoId?: string;
}

/** Pricing/executable part of a quote response (the `quote` object). */
export interface IntentQuoteDetails {
  amountIn: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  /** Minimum accepted input for the quote (for EXACT_INPUT it equals amountIn). */
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  minAmountOut?: string;
  /** Estimated completion time in seconds. */
  timeEstimate: number;
  /**
   * Address on the origin chain to send `amountIn` of `originAsset` to.
   * PRESENT ONLY for non-dry quotes: `dry: true` quotes deliberately omit it
   * (per the 1Click API docs: dry responses contain no deposit address).
   */
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
  timeWhenInactive?: string;
  refundFee?: string;
  withdrawFee?: string;
}

/** Full POST /v0/quote response envelope. */
export interface IntentQuote {
  quote: IntentQuoteDetails;
  quoteRequest?: Record<string, unknown>;
  /** ed25519 signature binding the quote to its deposit address. */
  signature?: string;
  timestamp?: string;
  correlationId?: string;
}

/** All documented 1Click status values, plus the synthetic NOT_FOUND. */
export type IntentStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

/** Result of GET /v0/status?depositAddress=... */
export interface IntentStatusResult {
  /** Documented value, or "NOT_FOUND" when the API returned 404. */
  status: IntentStatus | "NOT_FOUND";
  depositAddress: string;
  amountIn?: string;
  amountInFormatted?: string;
  amountOut?: string;
  destinationAsset?: string;
  /** Complete raw API payload, for any field not typed above. */
  raw?: unknown;
}

/** Parameters for {@link quoteDeposit}. */
export interface QuoteDepositParams {
  originAsset: string;
  destinationAsset: string;
  /** Amount in the SMALLEST UNIT of the origin asset, as an integer string. */
  amount: string;
  recipient: string;
  /** Address on the origin chain that receives refunds. */
  refundTo: string;
  /** Basis points (100 = 1%). Default 100. */
  slippageToleranceBps?: number;
  /** Default true: validate and price the swap without executing anything. */
  dry?: boolean;
  /** Deadline for the quote, in ms from now. Default 3 minutes. */
  deadlineMs?: number;
  /**
   * Route the quote through the Aurora-branded surface
   * (`${intentsBaseUrl}/api/quote/${appKey}`) instead of the 1Click API.
   * Requires AURORA_INTENTS_APP_KEY.
   */
  useAuroraApi?: boolean;
}

/** Parameters for the Monad-USDC convenience wrapper. */
export interface QuoteMonadUsdcDepositParams {
  /** Human amount of USDC, e.g. `0.5` or `"0.50"`. Converted to base units. */
  amountUsdc: string | number;
  recipient: string;
  refundTo: string;
  slippageToleranceBps?: number;
  dry?: boolean;
  deadlineMs?: number;
  useAuroraApi?: boolean;
}

/** Error thrown for non-2xx or malformed responses from the Intents APIs. */
export class IntentsApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly url: string,
    message: string,
  ) {
    super(`Intents API ${httpStatus} for ${url}: ${message}`);
    this.name = "IntentsApiError";
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Fetch JSON with a hard timeout and clear errors. */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `timed out after ${FETCH_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`Intents API request failed (${url}): ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    // fall through: non-JSON body is reported in the error below
  }

  if (!res.ok) {
    const apiMessage =
      body !== null && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 200);
    throw new IntentsApiError(res.status, url, apiMessage || res.statusText);
  }
  return body;
}

/** Convert a human decimal amount into an integer base-units string. */
export function toBaseUnits(value: string | number, decimals: number): string {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid amount "${text}": expected a non-negative decimal`);
  }
  const [whole, frac = ""] = text.split(".");
  if (frac.length > decimals) {
    throw new Error(
      `Amount ${text} has more than ${decimals} decimals for this asset`,
    );
  }
  const paddedFrac = frac.padEnd(decimals, "0");
  const combined = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  return combined.length === 0 ? "0" : combined;
}

// ---------------------------------------------------------------------------
// Asset registry
// ---------------------------------------------------------------------------

/** GET /v0/tokens — the full NEAR Intents asset registry (no key needed). */
export async function getTokens(): Promise<IntentToken[]> {
  const env = readEnv();
  const url = `${env.oneClickBaseUrl}/v0/tokens`;
  const body = await fetchJson(url, { method: "GET" });
  if (!Array.isArray(body)) {
    throw new Error(`Unexpected /v0/tokens response from ${url}: not an array`);
  }
  return body as IntentToken[];
}

/** Filter tokens whose `blockchain` field contains `chain` (case-insensitive). */
export function filterByBlockchain(tokens: IntentToken[], chain: string): IntentToken[] {
  const needle = chain.toLowerCase();
  return tokens.filter((t) => String(t.blockchain).toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

/** POST a quote to 1Click (default) or to the Aurora-branded API (opt-in). */
export async function quoteDeposit(params: QuoteDepositParams): Promise<IntentQuote> {
  const env = readEnv();
  const dry = params.dry ?? true;
  const slippageTolerance = params.slippageToleranceBps ?? DEFAULT_SLIPPAGE_TOLERANCE_BPS;
  const deadline = new Date(Date.now() + (params.deadlineMs ?? DEFAULT_DEADLINE_MS)).toISOString();

  const body = {
    dry,
    swapType: "EXACT_INPUT",
    slippageTolerance,
    originAsset: params.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: params.destinationAsset,
    amount: params.amount,
    recipient: params.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: params.refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
  } as const;

  let url: string;
  if (params.useAuroraApi === true) {
    if (!env.auroraAppKey) {
      throw new MissingConfigError(
        "AURORA_INTENTS_APP_KEY",
        "the Aurora Intents quote surface (useAuroraApi: true)",
        "Get a key at studio.aurora.dev or omit useAuroraApi to use the 1Click API, which needs no key.",
      );
    }
    url = `${env.intentsBaseUrl}/api/quote/${env.auroraAppKey}`;
  } else {
    url = `${env.oneClickBaseUrl}/v0/quote`;
  }

  const res = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res === null || typeof res !== "object" || !("quote" in (res as object))) {
    throw new Error(`Unexpected /quote response from ${url}: missing quote object`);
  }
  return res as IntentQuote;
}

/** Convenience wrapper: USDC on Base -> USDC on Monad. */
export async function quoteMonadUsdcDeposit(
  params: QuoteMonadUsdcDepositParams,
): Promise<IntentQuote> {
  return quoteDeposit({
    originAsset: BASE_USDC_ASSET_ID,
    destinationAsset: MONAD_USDC_ASSET_ID,
    amount: toBaseUnits(params.amountUsdc, USDC_DECIMALS),
    recipient: params.recipient,
    refundTo: params.refundTo,
    slippageToleranceBps: params.slippageToleranceBps,
    dry: params.dry,
    deadlineMs: params.deadlineMs,
    useAuroraApi: params.useAuroraApi,
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** GET /v0/status?depositAddress=... — 404 maps to status "NOT_FOUND". */
export async function getStatus(opts: {
  depositAddress: string;
  env?: ClaimlessEnv;
}): Promise<IntentStatusResult> {
  const env = opts.env ?? readEnv();
  const url = `${env.oneClickBaseUrl}/v0/status?depositAddress=${encodeURIComponent(
    opts.depositAddress,
  )}`;

  let body: unknown;
  try {
    body = await fetchJson(url, { method: "GET" });
  } catch (err) {
    if (err instanceof IntentsApiError && err.httpStatus === 404) {
      return { status: "NOT_FOUND", depositAddress: opts.depositAddress, raw: undefined };
    }
    throw err;
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "UNKNOWN";
  return {
    status: status as IntentStatusResult["status"],
    depositAddress: typeof record.depositAddress === "string" ? record.depositAddress : opts.depositAddress,
    amountIn: typeof record.amountIn === "string" ? record.amountIn : undefined,
    amountInFormatted:
      typeof record.amountInFormatted === "string" ? record.amountInFormatted : undefined,
    amountOut: typeof record.amountOut === "string" ? record.amountOut : undefined,
    destinationAsset:
      typeof record.destinationAsset === "string" ? record.destinationAsset : undefined,
    raw: body,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Human-readable multi-line rendering of a quote, for CLI output. */
export function formatQuote(q: IntentQuote): string {
  const details = q.quote;
  const lines: string[] = [];
  lines.push(`  amount in:      ${details.amountInFormatted ?? details.amountIn}`);
  lines.push(`  amount out:     ${details.amountOutFormatted ?? details.amountOut}`);
  if (details.amountInUsd !== undefined) {
    lines.push(`  in USD:         ~$${details.amountInUsd}`);
  }
  if (details.amountOutUsd !== undefined) {
    lines.push(`  out USD:        ~$${details.amountOutUsd}`);
  }
  if (details.minAmountOut !== undefined) {
    lines.push(`  min amount out: ${details.minAmountOut}`);
  }
  if (details.minAmountIn !== undefined) {
    lines.push(`  min amount in:  ${details.minAmountIn}`);
  }
  lines.push(`  time estimate:  ${details.timeEstimate}s`);
  lines.push(
    `  depositAddress: ${details.depositAddress ?? "(omitted by the API for dry quotes)"}`,
  );
  if (details.depositMemo !== undefined) {
    lines.push(`  deposit memo:   ${details.depositMemo}`);
  }
  if (q.correlationId !== undefined) {
    lines.push(`  correlationId:  ${q.correlationId}`);
  }
  return lines.join("\n");
}