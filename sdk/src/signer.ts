/**
 * Signer abstraction for the Claimless SDK.
 *
 * Two implementations, one interface, because Claimless deliberately separates
 * the two kinds of actor (see docs/WALLET_DECISION.md):
 *
 *   HUMAN underwriter      -> Mera passkey      (needs user presence, device-bound)
 *   AUTONOMOUS agent       -> Privy agent wallet (TEE-held key, no user present)
 *
 * `resolveSigner()` picks Privy when credentials exist and otherwise falls back
 * to a local private key, so the demo works before Privy is set up. It never
 * throws at import time.
 *
 * The local signer is only a DEMO fallback. In production an autonomous agent
 * should use a Privy agent wallet, where the private key lives in a TEE and the
 * agent process only ever holds an ephemeral signing key.
 */

import {
  createWalletClient,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient } from "viem";
import { monadTestnet } from "./chain.js";
import { readEnv, type ClaimlessEnv } from "./env.js";

/** Which backing store a signer uses. */
export type SignerKind = "privy" | "local";

/**
 * A signer is anything that can give us an address and a viem wallet client.
 * Keeping the wallet client as the interface (rather than a bespoke tx method)
 * means the whole existing SDK works unchanged with either kind.
 */
export interface Signer {
  readonly kind: SignerKind;
  readonly account: Account;
  readonly walletClient: WalletClient<Transport, Chain | undefined, Account>;
  address(): Promise<`0x${string}`>;
}

/** Read-only client shared by both kinds. */
export function publicClientFor(env: ClaimlessEnv = readEnv()): PublicClient {
  return createPublicClient({ chain: monadTestnet, transport: http(env.rpcUrl) }) as PublicClient;
}

/** A signer backed by a raw private key. Demo/testing only. */
export function createLocalSigner(privateKey: string, env: ClaimlessEnv = readEnv()): Signer {
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(env.rpcUrl),
  });
  return {
    kind: "local",
    account,
    walletClient,
    address: async () => account.address,
  };
}

/**
 * A signer backed by a Privy agent wallet.
 *
 * LIVE TEST PENDING: we do not have Privy credentials yet, so the REST calls
 * below are written against Privy's documented surface but have not been
 * exercised against the real API. They are isolated here so that wiring them up
 * later touches one function.
 *
 * Verified design facts (from docs.privy.io, agent wallets):
 *  - keys live in a TEE; the agent receives a short-lived ephemeral signing key
 *  - the private key is never exposed to the agent process
 *  - a policy engine (per-tx caps, allowlists) governs what the wallet will sign
 *  - wallets are addressed by a wallet id, and signing is a server-side API call
 *
 * To go live: set PRIVY_APP_ID and PRIVY_APP_SECRET, create (or reuse) an agent
 * wallet, and confirm the two endpoints below against the Privy dashboard.
 */
export async function createPrivySigner(opts: {
  appId: string;
  appSecret: string;
  walletId?: string;
  env?: ClaimlessEnv;
  /** Override for testing; defaults to Privy's REST base. */
  baseUrl?: string;
}): Promise<Signer> {
  const baseUrl = opts.baseUrl ?? "https://auth.privy.io/api/v1";
  const auth = `Basic ${Buffer.from(`${opts.appId}:${opts.appSecret}`).toString("base64")}`;
  const headers = { Authorization: auth, "privy-app-id": opts.appId, "Content-Type": "application/json" };

  // UNCERTAIN: verify this path against docs.privy.io before relying on it live.
  let walletId = opts.walletId;
  let address: `0x${string}` | undefined;
  if (!walletId) {
    const created = await fetch(`${baseUrl}/wallets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chain_type: "ethereum" }),
    });
    if (!created.ok) {
      throw new Error(`Privy wallet creation failed: HTTP ${created.status} ${await created.text()}`);
    }
    const body = (await created.json()) as { id?: string; address?: string };
    walletId = body.id;
    address = body.address as `0x${string}` | undefined;
  }

  if (!walletId) throw new Error("Privy did not return a wallet id.");

  const walletAddress = (address ?? (await privyGetAddress(baseUrl, headers, walletId))) as `0x${string}`;
  const account = {
    address: walletAddress,
    type: "json-rpc",
  } as unknown as Account;

  throw new Error(
    "Privy signer is not live yet: set PRIVY_APP_ID/PRIVY_APP_SECRET and confirm " +
      `the wallet API paths (wallet ${walletId} resolved to ${walletAddress}). ` +
      "Until then use MONAD_PRIVATE_KEY (local signer) for the demo.",
  );
}

/** Reads a Privy wallet's address. Split out so the URL is easy to audit. */
async function privyGetAddress(
  baseUrl: string,
  headers: Record<string, string>,
  walletId: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/wallets/${walletId}`, { headers });
  if (!res.ok) throw new Error(`Privy wallet lookup failed: HTTP ${res.status}`);
  const body = (await res.json()) as { address?: string };
  if (!body.address) throw new Error("Privy wallet has no address.");
  return body.address;
}

export class SignerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignerUnavailableError";
  }
}

/**
 * Picks the best available signer.
 *
 * Order:
 *  1. Privy, when PRIVY_APP_ID and PRIVY_APP_SECRET are both set
 *  2. a local private key from MONAD_PRIVATE_KEY (demo fallback)
 *  3. otherwise a clear, actionable error
 */
export async function resolveSigner(env: ClaimlessEnv = readEnv()): Promise<Signer> {
  if (env.privyAppId && env.privyAppSecret) {
    return createPrivySigner({ appId: env.privyAppId, appSecret: env.privyAppSecret, env });
  }
  if (env.privateKey) {
    return createLocalSigner(env.privateKey, env);
  }
  throw new SignerUnavailableError(
    "No signer available. Set MONAD_PRIVATE_KEY for the local demo signer, or " +
      "PRIVY_APP_ID + PRIVY_APP_SECRET to use a Privy agent wallet.",
  );
}

/** Which signer `resolveSigner()` would choose, without constructing it. */
export function describeSignerAvailability(env: ClaimlessEnv = readEnv()): {
  kind: SignerKind | "none";
  reason: string;
} {
  if (env.privyAppId && env.privyAppSecret) {
    return { kind: "privy", reason: "PRIVY_APP_ID and PRIVY_APP_SECRET are set" };
  }
  if (env.privateKey) {
    return { kind: "local", reason: "MONAD_PRIVATE_KEY is set (demo fallback)" };
  }
  return { kind: "none", reason: "neither Privy credentials nor MONAD_PRIVATE_KEY are set" };
}

/**
 * Entry point used by `privy.ts#createAgentSigner`.
 *
 * Attempts the real Privy path and, when that path is not yet live, throws a
 * message that names exactly what remains to be done. It deliberately does NOT
 * silently fall back to the local key: a caller asking for a Privy signer must
 * not receive something that is not one.
 */
export async function createSignerPlaceholder(env: ClaimlessEnv): Promise<Signer> {
  if (!env.privyAppId || !env.privyAppSecret) {
    throw new SignerUnavailableError("Privy credentials are not configured.");
  }
  return createPrivySigner({ appId: env.privyAppId, appSecret: env.privyAppSecret, env });
}
