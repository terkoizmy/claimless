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
import { privateKeyToAccount, toAccount } from "viem/accounts";
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
 * Live endpoints (all three VERIFIED against the real API on 2026-09-21):
 *   POST https://auth.privy.io/api/v1/wallets            create wallet  -> 200
 *   GET  https://auth.privy.io/api/v1/wallets/{id}       read address   -> 200
 *   POST https://api.privy.io/v1/wallets/{id}/rpc        personal_sign  -> 200
 *
 * Note the host differs: wallet *management* is on `auth.privy.io`, while the
 * wallet *RPC* (signing) is on `api.privy.io`. Signing needs Basic auth with
 * appId:appSecret plus the `privy-app-id` header. An authorization key
 * (PRIVY_AUTHORIZATION_PRIVATE_KEY) is only needed for owners/quorum setups.
 */
export async function createPrivySigner(opts: {
  appId: string;
  appSecret: string;
  walletId?: string;
  env?: ClaimlessEnv;
  /** Override for testing; defaults to Privy's REST base. */
  baseUrl?: string;
  /** Override for testing; defaults to Privy's wallet-RPC base. */
  rpcBaseUrl?: string;
}): Promise<Signer> {
  const baseUrl = opts.baseUrl ?? "https://auth.privy.io/api/v1";
  const rpcBaseUrl = opts.rpcBaseUrl ?? "https://api.privy.io/v1";
  const auth = `Basic ${Buffer.from(`${opts.appId}:${opts.appSecret}`).toString("base64")}`;
  const headers = { Authorization: auth, "privy-app-id": opts.appId, "Content-Type": "application/json" };

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

  /**
   * A viem Account backed by the Privy wallet.
   *
   * The private key never reaches this process: every signature is a server-side
   * call, and Privy's policy engine can veto it. That is the whole point of using
   * Privy for autonomous agents.
   *
   * `toAccount` gives us a complete viem Account from just an address plus the
   * signing primitives, so the entire existing SDK keeps working unchanged.
   */
  const account = toAccount({
    address: walletAddress,
    async signMessage({ message }) {
      const text = typeof message === "string" ? message : bytesToSignableString(message);
      return privySign(walletId!, "personal_sign", { message: text, encoding: "utf-8" }, rpcBaseUrl, headers);
    },
    async signTypedData(typedData) {
      // EIP-712. Privy expects the domain/types/message triple plus the encoding.
      const result = await privyRpc(
        walletId!,
        "eth_signTypedData_v4",
        {
          typed_data: {
            domain: typedData.domain,
            types: { ...typedData.types },
            primaryType: typedData.primaryType,
            message: typedData.message,
          },
        },
        rpcBaseUrl,
        headers,
      );
      return result as `0x${string}`;
    },
    async signTransaction(transaction) {
      throw new SignerUnavailableError(
        "Privy signTransaction is not wired yet. The verified path is " +
          "POST https://api.privy.io/v1/wallets/{id}/rpc with method " +
          "'eth_signTransaction'. Use the reportIncident write path via " +
          "walletClient.sendTransaction once this is implemented.",
      );
    },
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http((opts.env ?? readEnv()).rpcUrl),
  });

  return {
    kind: "privy",
    account,
    walletClient,
    address: async () => walletAddress,
  };
}

/** Renders a viem SignableMessage as a utf-8 string for Privy's personal_sign. */
function bytesToSignableString(message: { raw: `0x${string}` | Uint8Array }): string {
  const raw = message.raw;
  return typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
}

/**
 * Calls Privy's wallet RPC and returns the `data` payload.
 *
 * Split out so the one network boundary in the signing path is auditable.
 */
async function privyRpc(
  walletId: string,
  method: string,
  params: Record<string, unknown>,
  rpcBaseUrl: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`${rpcBaseUrl}/wallets/${walletId}/rpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chain_type: "ethereum", method, params }),
  });
  if (!res.ok) {
    throw new Error(`Privy rpc ${method} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { signature?: string } };
  return body.data?.signature ?? body.data;
}

/** Signs a message via Privy and returns the 0x signature. */
async function privySign(
  walletId: string,
  method: string,
  params: Record<string, unknown>,
  rpcBaseUrl: string,
  headers: Record<string, string>,
): Promise<`0x${string}`> {
  const sig = await privyRpc(walletId, method, params, rpcBaseUrl, headers);
  if (typeof sig !== "string") throw new Error("Privy returned no signature.");
  return sig as `0x${string}`;
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
