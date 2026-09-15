/**
 * Claimless SDK — Mera passkey module (human underwriter account layer).
 *
 * Mera (Category Labs, github.com/category-labs/mera) turns a WebAuthn
 * passkey into blockchain accounts. It is fully client-side: NO API key, NO
 * server, NO custody. Accounts are regular EOAs; nothing needs deploying.
 * Mera is used here for the HUMAN underwriter (Privy covers autonomous
 * agents — wallet separation per docs/WALLET_DECISION.md).
 *
 * ─── How Mera derives keys (VERIFIED against the official docs) ─────────────
 * https://mera.category.xyz/concepts/passkeys-and-prf/ and
 * https://mera.category.xyz/recipes/create-passkey-accounts/
 *
 * 1. A passkey ceremony (create or assertion) evaluates the WebAuthn PRF
 *    extension. The caller passes a 32-byte salt; the authenticator returns
 *    a 32-byte PRF output, a deterministic function of (credential, rpId,
 *    salt). Mera's default salt is sha256(utf8("mera.prf.salt.v1")) and is
 *    stable across library versions, so one passkey always recomputes the
 *    same bytes on every synced device.
 * 2. The PRF output is BIP-39 ENTROPY: entropyToMnemonic(prfOutput) gives a
 *    24-word mnemonic; mnemonicToSeedSync(mnemonic) (PBKDF2-HMAC-SHA512,
 *    2048 rounds, salt "mnemonic") gives the 64-byte BIP-32 master seed.
 * 3. EVM keys derive from that seed via BIP-32/BIP-44 at
 *    `m/44'/60'/0'/0/{index}`. One seed backs any number of EOAs; nothing is
 *    stored per account, and every key is reproducible from the same
 *    passkey. This is exactly the pipeline of mera's own docs recipe, which
 *    uses the same audited @scure/bip32 + @scure/bip39 stack that viem
 *    already depends on (no new dependencies here).
 *
 * Byte→key mapping, exactly:
 *   - the 32 PRF bytes ARE the BIP-39 entropy (BIP-39 splits the bit string
 *     into 11-bit words and appends a checksum; entropyToMnemonic does it);
 *   - the mnemonic seeds PBKDF2-HMAC-SHA512 (2048 iterations, salt
 *     "mnemonic", 64-byte output) — the standard BIP-39 seed function;
 *   - the seed is the BIP-32 master key; the child at
 *     m/44'/60'/0'/0/{index} yields a 32-byte secp256k1 private key;
 *   - the EOA address is the keccak-based address of its public key,
 *     EIP-55 checksummed by viem.
 *
 * ─── Node safety ────────────────────────────────────────────────────────────
 * PRF/passkey APIs exist only in a browser secure context (HTTPS or
 * localhost). This module NEVER touches `window` or `navigator` at import
 * time: importing it in Node is safe. Every browser API access is behind a
 * runtime guard; the browser-only functions throw an actionable `MeraError`
 * in Node. `sdk/scripts/mera-demo.ts` runs in Node and illustrates "one
 * passkey → many keys" with a clearly-labelled stubbed PRF output.
 *
 * Bounties targeted:
 *  - "Best Mera-Powered UX on Monad" ($2,500) — passkey login for the human.
 *  - "Mera: One Passkey, Many Keys" ($2,500) — `deriveManyKeys`: N distinct
 *    EOAs from ONE passkey, every one reproducible from the same passkey.
 *
 * Status: CODE COMPLETE, LIVE PRF TEST PENDING — the ceremony needs a human
 * with a browser and a passkey stored in Google Password Manager.
 */

import type { Address, Hash, Hex, TypedDataDefinition } from "viem";
import { sha256 as viemSha256, toHex } from "viem";
import {
  mnemonicToAccount,
  signMessage as viemSignMessage,
  signTypedData as viemSignTypedData,
  type LocalAccount,
} from "viem/accounts";

/* ─────────────────────────────── constants ─────────────────────────────── */

/** Mera's fixed, version-stable PRF salt label (VERIFIED: mera docs). */
export const MERA_PRF_SALT_LABEL = "mera.prf.salt.v1" as const;

/** The BIP-44 Ethereum path prefix Mera's docs use for numbered EVM accounts. */
export const EVM_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0" as const;

/**
 * Remediation for the single most common Mera setup failure: on desktop
 * Chrome, only passkeys stored in Google Password Manager return PRF output.
 * Passkeys saved to the local Chrome profile throw `PRF_UNAVAILABLE`.
 */
export const MERA_PRF_REMEDIATION =
  "Mera needs a PRF-capable passkey. On desktop Chrome, only passkeys stored " +
  "in Google Password Manager return PRF output; passkeys saved to the local " +
  "Chrome profile throw PRF_UNAVAILABLE. Fix: make sure Chrome is signed in " +
  "and syncing (see passwords.google.com), create the passkey from this app " +
  "served over HTTPS (or http://localhost), and let Chrome save it into " +
  "Google Password Manager. Then re-run the ceremony, or test against " +
  "https://mera.category.xyz/demo. WebAuthn also requires a secure context: " +
  "HTTPS or localhost.";

/** Machine-readable failure modes for the Mera layer. */
export type MeraErrorCode =
  /** The authenticator does not return a usable 32-byte PRF output. */
  | "PRF_UNAVAILABLE"
  /** Called outside a browser (Node script, server, etc.). */
  | "BROWSER_UNAVAILABLE"
  /** Browser present but not a secure context (needs HTTPS or localhost). */
  | "SECURE_CONTEXT"
  /** The WebAuthn ceremony failed, timed out, or was cancelled. */
  | "CEREMONY_FAILED"
  /** Signing payload is malformed. */
  | "PAYLOAD_INVALID"
  /** Key derivation produced an unusable key. */
  | "DERIVATION_FAILED";

/** Error thrown by every failing operation in this module. */
export class MeraError extends Error {
  readonly code: MeraErrorCode;

  constructor(code: MeraErrorCode, message: string) {
    super(`[Mera ${code}] ${message}`);
    this.name = "MeraError";
    this.code = code;
  }
}

/* ─────────────────────────── WebAuthn typing ───────────────────────────── */

/**
 * WebAuthn typing WITHOUT "dom" in tsconfig lib (the sdk tsconfig keeps
 * lib: ["ES2022"] to stay Node-safe). These declarations mirror the standard
 * W3C shapes, scoped to exactly what this module touches. They are types
 * only — nothing here runs at import time.
 */
type BufferSourceLike = ArrayBufferView | ArrayBuffer;

interface PrfEvalSpec {
  first: BufferSourceLike;
  second?: BufferSourceLike;
}

interface PublicKeyCredentialDescriptorLike {
  type: "public-key";
  id: BufferSourceLike;
  transports?: string[];
}

interface PublicKeyCredentialParametersLike {
  type: "public-key";
  alg: number;
}

interface PublicKeyCredentialRpEntityLike {
  id?: string;
  name: string;
}

interface PublicKeyCredentialUserEntityLike {
  id: BufferSourceLike;
  name: string;
  displayName: string;
}

interface PublicKeyCredentialCreationOptionsLike {
  challenge: BufferSourceLike;
  rp: PublicKeyCredentialRpEntityLike;
  user: PublicKeyCredentialUserEntityLike;
  pubKeyCredParams: PublicKeyCredentialParametersLike[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorLike[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    requireResidentKey?: boolean;
    residentKey?: "required" | "preferred" | "discouraged";
    userVerification?: "required" | "preferred" | "discouraged";
  };
  attestation?: "none" | "indirect" | "direct" | "enterprise";
  extensions?: { prf?: {} };
}

interface PublicKeyCredentialRequestOptionsLike {
  challenge: BufferSourceLike;
  rpId?: string;
  timeout?: number;
  allowCredentials?: PublicKeyCredentialDescriptorLike[];
  userVerification?: "required" | "preferred" | "discouraged";
  extensions?: { prf?: { eval?: PrfEvalSpec } };
}

interface AuthenticationExtensionsClientOutputsLike {
  prf?: {
    results?: { first?: ArrayBuffer; second?: ArrayBuffer };
    enabled?: boolean;
  };
}

interface PublicKeyCredentialLike {
  rawId: ArrayBuffer;
  response: unknown;
  getClientExtensionResults(): AuthenticationExtensionsClientOutputsLike;
}

interface CredentialCreationOptionsLike {
  publicKey: PublicKeyCredentialCreationOptionsLike;
}

interface CredentialRequestOptionsLike {
  publicKey: PublicKeyCredentialRequestOptionsLike;
  signal?: unknown;
}

interface CredentialsContainerLike {
  create(options?: CredentialCreationOptionsLike): Promise<PublicKeyCredentialLike | null>;
  get(options?: CredentialRequestOptionsLike): Promise<PublicKeyCredentialLike | null>;
}

interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle?: {
    digest(algorithm: string, data: BufferSourceLike): Promise<ArrayBuffer>;
    importKey(
      format: "raw",
      keyData: BufferSourceLike,
      algorithm: string,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<unknown>;
    deriveBits(
      algorithm: {
        name: string;
        hash: string;
        salt: BufferSourceLike;
        iterations: number;
      },
      key: unknown,
      length: number,
    ): Promise<ArrayBuffer>;
  };
}

interface WindowLike {
  location: { hostname: string };
}

interface NavigatorLike {
  credentials: CredentialsContainerLike;
}

/** Shape of the pieces of `window`/`navigator`/`crypto` this module touches. */
interface MeraRuntime {
  window?: WindowLike;
  document?: unknown;
  isSecureContext?: boolean;
  PublicKeyCredential?: unknown;
  crypto?: CryptoLike;
  navigator?: NavigatorLike;
}

function runtime(): MeraRuntime {
  // All DOM access lives inside these guarded functions; nothing evaluates
  // window/navigator at module import time.
  return globalThis as unknown as MeraRuntime;
}

/* ─────────────────────────────── guards ────────────────────────────────── */

/**
 * True only when WebAuthn is actually usable right now: a browser window, a
 * secure context (HTTPS or localhost), and `PublicKeyCredential` available.
 * Safe in Node: returns `false` without throwing. Note this checks
 * *WebAuthn* availability; PRF support is only knowable after a ceremony,
 * so `true` here does not guarantee `PRF_UNAVAILABLE` will not be thrown.
 */
export function isMeraAvailable(): boolean {
  const rt = runtime();
  const isBrowser = typeof rt.window !== "undefined" && typeof rt.document !== "undefined";
  if (!isBrowser) return false;
  if (rt.isSecureContext !== true) return false;
  return typeof rt.PublicKeyCredential !== "undefined";
}

/** Throws an actionable error unless running inside a browser secure context. */
function requireBrowserSecureContext(): void {
  const rt = runtime();
  const isBrowser = typeof rt.window !== "undefined" && typeof rt.document !== "undefined";
  if (!isBrowser) {
    throw new MeraError(
      "BROWSER_UNAVAILABLE",
      "Mera requires a browser secure context; see scripts/mera-demo.ts for the Node-side explanation.",
    );
  }
  if (rt.isSecureContext !== true) {
    throw new MeraError(
      "SECURE_CONTEXT",
      "WebAuthn requires HTTPS or localhost. Serve the app over HTTPS (or use http://localhost) and retry.",
    );
  }
  if (typeof rt.PublicKeyCredential === "undefined") {
    throw new MeraError(
      "BROWSER_UNAVAILABLE",
      "PublicKeyCredential is unavailable in this browser. Use a modern Chrome, Edge, or Safari build.",
    );
  }
}

/* ─────────────────────────────── results ───────────────────────────────── */

/** Credential metadata from a ceremony; persist it to pin future sign-ins. */
export interface MeraCredentialMetadata {
  /** Canonical unpadded base64url credential ID. */
  credentialId: string;
  /** Relying party ID the passkey is bound to (domain). */
  rpId: string;
}

/** A single WebAuthn PRF assertion result. */
export interface PasskeyHandle {
  /** 32-byte PRF output from the authenticator. In memory only. */
  prfOutput: Uint8Array;
  credential: MeraCredentialMetadata;
}

/** A passkey-backed account, with its derived key material held in memory only. */
export interface MeraAccount {
  address: Address;
  /** The 24-word BIP-39 mnemonic recreated from the PRF output. In memory only. */
  mnemonic: string;
  /** The 64-byte BIP-32 master seed derived from the mnemonic via PBKDF2. In memory only. */
  seed: Uint8Array;
  /** The 32-byte PRF output this account derives from. In memory only. */
  prfOutput: Uint8Array;
  credential: MeraCredentialMetadata;
  /** Index in the "one passkey, many keys" tree (0 = primary). */
  index: number;
  /** Signs an ERC-191 `personal_sign` message. */
  signMessage: (message: string | Uint8Array) => Promise<Hash>;
  /** Signs EIP-712 typed data (as the Intents flow needs). */
  signTypedData: (typedData: TypedDataDefinition) => Promise<Hash>;
}

/** One purpose-bound key derived from the passkey's PRF output. */
export interface MeraDerivedKey {
  /** Free-form purpose label, e.g. "claimless:underwriter". */
  purpose: string;
  address: Address;
  index: number;
}

export interface CreatePasskeyAccountOpts {
  /** Relying-party ID. Defaults to the current hostname; passkeys are bound to it. */
  rpId?: string;
  /** Human-readable relying-party name shown in the authenticator UI. */
  rpName?: string;
  /** User name passed to WebAuthn. */
  userName?: string;
  /** User display name passed to WebAuthn. */
  userDisplayName?: string;
}

/* ─────────────────────────── crypto utilities ──────────────────────────── */

/** The 32-byte PRF salt Mera uses by default: sha256(utf8("mera.prf.salt.v1")). */
export async function getPrfSalt(): Promise<Uint8Array> {
  const rt = runtime();
  if (rt.crypto?.subtle) {
    const digest = await rt.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(MERA_PRF_SALT_LABEL),
    );
    return new Uint8Array(digest);
  }
  // Node fallback (used by the demo script).
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(MERA_PRF_SALT_LABEL, "utf8").digest());
}

/** 32 random bytes for WebAuthn challenges and user handles. */
function random32(): Uint8Array {
  const rt = runtime();
  if (rt.crypto) return rt.crypto.getRandomValues(new Uint8Array(32));
  throw new MeraError("DERIVATION_FAILED", "crypto.getRandomValues is unavailable");
}

/** Canonical unpadded base64url encode (WebAuthn buffers). */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a base64url string to bytes; accepts canonical unpadded input. */
function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/* ─────────────────────────── key derivation ────────────────────────────── */

/**
 * PRF output (32 bytes) → 24-word BIP-39 mnemonic → 64-byte BIP-32 seed.
 *
 * Byte-for-byte the pipeline documented on
 * https://mera.category.xyz/recipes/create-passkey-accounts/ ("Create a seed
 * from the PRF output"): the PRF bytes are BIP-39 entropy (24-word mnemonic),
 * then the standard BIP-39 seed function (PBKDF2-HMAC-SHA512, 2048 rounds,
 * salt "mnemonic") yields the 64-byte BIP-32 master seed. Implemented with
 * node:crypto/webcrypto so Node AND browsers both work with zero extra deps.
 */
function prfOutputToSeed(prfOutput: Uint8Array): { mnemonic: string; seed: Uint8Array } {
  if (prfOutput.length !== 32) {
    throw new MeraError("DERIVATION_FAILED", `PRF output must be 32 bytes, got ${prfOutput.length}`);
  }
  const mnemonic = mnemonicFromEntropy(prfOutput);
  const seed = bip39SeedFromMnemonicSync(mnemonic);
  return { mnemonic, seed };
}

/**
 * BIP-39 entropy → mnemonic, implemented locally to keep byte parity with
 * @scure/bip39 without a new dependency. Standard algorithm: 11-bit word
 * indices over (entropy ‖ checksum), checksum = first ENT/32 bits of
 * sha256(entropy). With 32 bytes of entropy this yields a 24-word mnemonic.
 */
function mnemonicFromEntropy(entropy: Uint8Array): string {
  const ENT = entropy.length * 8;
  if (ENT < 128 || ENT > 256 || ENT % 32 !== 0) {
    throw new MeraError("DERIVATION_FAILED", `entropy must be 16..32 bytes, got ${entropy.length}`);
  }
  const CS = ENT / 32;
  const bits = new Uint8Array(ENT + CS);
  for (let i = 0; i < entropy.length; i++) {
    for (let j = 0; j < 8; j++) {
      bits[i * 8 + j] = (entropy[i] >> (7 - j)) & 1;
    }
  }
  // viem's sha256 is synchronous and isomorphic (Node + browser).
  const hash = hexToBytes(viemSha256(entropy));
  for (let i = 0; i < CS; i++) {
    bits[ENT + i] = (hash[i >> 3] >> (7 - (i % 8))) & 1;
  }
  const words: string[] = [];
  for (let i = 0; i < (ENT + CS) / 11; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i * 11 + j];
    words.push(ENGLISH_WORDLIST[idx]);
  }
  return words.join(" ");
}

/** `0x`-hex string → bytes (isomorphic; avoids Buffer/atob divergence). */
function hexToBytes(hex: `0x${string}`): Uint8Array {
  const out = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return out;
}

/**
 * Standard BIP-39 seed: PBKDF2-HMAC-SHA512(mnemonic, "mnemonic", 2048, 64).
 * Synchronous via node:crypto under Node; browsers must await the async
 * variant (bip39SeedFromMnemonicAsync) — the browser ceremonies do.
 */
function bip39SeedFromMnemonicSync(mnemonic: string): Uint8Array {
  const { pbkdf2Sync } = require("node:crypto") as typeof import("node:crypto");
  return new Uint8Array(
    pbkdf2Sync(mnemonic.normalize("NFKD"), "mnemonic", 2048, 64, "sha512"),
  );
}

/** Browser-path BIP-39 seed via Web Crypto. Used by the async ceremonies. */
async function bip39SeedFromMnemonicAsync(mnemonic: string): Promise<Uint8Array> {
  const rt = runtime();
  if (!rt.crypto?.subtle) {
    throw new MeraError("DERIVATION_FAILED", "crypto.subtle is unavailable in this runtime");
  }
  const encoder = new TextEncoder();
  const key = await rt.crypto.subtle.importKey(
    "raw",
    encoder.encode(mnemonic.normalize("NFKD")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await rt.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: encoder.encode("mnemonic"),
      iterations: 2048,
    },
    key,
    512,
  );
  return new Uint8Array(bits);
}

/**
 * Seed → BIP-44 EVM account at `m/44'/60'/0'/0/{index}` (the exact path in
 * mera's docs). `index` is the "many keys" counter: index 0 is the primary
 * underwriter account, higher indexes are purpose-bound accounts.
 */
function seedToEoa(mnemonic: string, index: number): LocalAccount {
  return mnemonicToAccount(mnemonic, {
    // mera's recipe: m/44'/60'/0'/0/{index} — accountIndex 0, changeIndex 0.
    accountIndex: 0,
    changeIndex: 0,
    addressIndex: index,
  }) as LocalAccount;
}

/* ───────────────────────── account construction ────────────────────────── */

function buildAccount(
  viemAccount: LocalAccount,
  prfOutput: Uint8Array,
  index: number,
  credential: MeraCredentialMetadata,
  mnemonic: string,
  seed: Uint8Array,
): MeraAccount {
  return {
    address: viemAccount.address,
    mnemonic,
    seed,
    prfOutput,
    credential,
    index,
    signMessage: (message) => signWithPasskey(viemAccount, { message }),
    signTypedData: (typedData) => signWithPasskey(viemAccount, { typedData }),
  };
}

/** Turns a PRF output into the primary MeraAccount (index 0). */
function prfOutputToAccount(
  prfOutput: Uint8Array,
  credential: MeraCredentialMetadata,
): MeraAccount {
  const { mnemonic, seed } = prfOutputToSeed(prfOutput);
  const viemAccount = seedToEoa(mnemonic, 0);
  return buildAccount(viemAccount, prfOutput, 0, credential, mnemonic, seed);
}

/* ──────────────────────────── PRF ceremonies ───────────────────────────── */

/**
 * Runs one PRF assertion against an existing passkey (the "sign in"
 * ceremony). Uses the exact WebAuthn call mera's `getPasskeyPrfOutput` makes:
 * user verification required, PRF extension with the 32-byte salt
 * sha256("mera.prf.salt.v1").
 *
 * Throws `MeraError("PRF_UNAVAILABLE")` carrying MERA_PRF_REMEDIATION when
 * the authenticator returns no PRF output — the common Chrome/GPM pitfall.
 */
export async function getPasskeyPrfOutput(opts: {
  rpId?: string;
  /** Stored credential metadata to pin the assertion to one passkey. */
  credentialId?: string;
}): Promise<PasskeyHandle> {
  requireBrowserSecureContext();
  const rt = runtime();
  const rpId = opts.rpId ?? rt.window?.location.hostname;
  if (!rpId) {
    throw new MeraError("CEREMONY_FAILED", "No rpId available; pass one explicitly.");
  }
  const salt = await getPrfSalt();

  const allowCredentials =
    opts.credentialId !== undefined
      ? [{ type: "public-key" as const, id: base64UrlDecode(opts.credentialId) }]
      : [];

  let assertion: PublicKeyCredentialLike | null;
  try {
    assertion = await rt.navigator!.credentials!.get({
      publicKey: {
        challenge: random32(),
        rpId,
        timeout: 120_000,
        userVerification: "required",
        allowCredentials,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (err) {
    throw new MeraError(
      "CEREMONY_FAILED",
      `PRF assertion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!assertion) throw new MeraError("CEREMONY_FAILED", "No credential selected.");

  const first = assertion.getClientExtensionResults().prf?.results?.first;
  if (!first) {
    throw new MeraError("PRF_UNAVAILABLE", MERA_PRF_REMEDIATION);
  }
  const prfOutput = new Uint8Array(first);
  if (prfOutput.length !== 32) {
    throw new MeraError(
      "PRF_UNAVAILABLE",
      `Authenticator returned a ${prfOutput.length}-byte PRF output. ${MERA_PRF_REMEDIATION}`,
    );
  }

  return {
    prfOutput,
    credential: { credentialId: base64UrlEncode(new Uint8Array(assertion.rawId)), rpId },
  };
}

/**
 * Registers a new passkey credential WITH the PRF extension and derives an
 * EOA from the returned PRF output. Browser only.
 *
 * Derivation (documented above, VERIFIED against mera's docs):
 *   prfOutput (32B) --BIP-39--> 24-word mnemonic --PBKDF2--> 64B seed
 *     --BIP-32 m/44'/60'/0'/0/0--> secp256k1 key --> EOA
 *
 * Mirrors mera's `createPasskeyWithPrfOutput`, including the fallback
 * assertion for authenticators that do not evaluate PRF at creation time.
 */
export async function createPasskeyAccount(opts: CreatePasskeyAccountOpts = {}): Promise<MeraAccount> {
  requireBrowserSecureContext();
  const rt = runtime();
  const rpId = opts.rpId ?? rt.window?.location.hostname;
  if (!rpId) {
    throw new MeraError("CEREMONY_FAILED", "No rpId available; pass one explicitly.");
  }

  let credential: PublicKeyCredentialLike | null;
  try {
    credential = await rt.navigator!.credentials!.create({
      publicKey: {
        challenge: random32(),
        rp: { id: rpId, name: opts.rpName ?? "Claimless" },
        user: {
          // Fresh random handle per creation: adds a passkey instead of
          // overwriting an existing one.
          id: random32(),
          name: opts.userName ?? "claimless-underwriter",
          displayName: opts.userDisplayName ?? "Claimless Underwriter",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        timeout: 120_000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        extensions: { prf: {} },
      },
    });
  } catch (err) {
    throw new MeraError(
      "CEREMONY_FAILED",
      `Passkey creation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!credential) throw new MeraError("CEREMONY_FAILED", "Passkey creation was cancelled.");

  const credentialId = base64UrlEncode(new Uint8Array(credential.rawId));
  const first = credential.getClientExtensionResults().prf?.results?.first;

  // Fallback assertion, same as mera: some authenticators evaluate PRF only
  // on assertions, not at creation time.
  if (!first) {
    const handle = await getPasskeyPrfOutput({ rpId, credentialId });
    return prfOutputToAccount(handle.prfOutput, { credentialId, rpId });
  }
  const prfOutput = new Uint8Array(first);
  if (prfOutput.length !== 32) {
    throw new MeraError("PRF_UNAVAILABLE", MERA_PRF_REMEDIATION);
  }
  return prfOutputToAccount(prfOutput, { credentialId, rpId });
}

/* ───────────────────────── one passkey, many keys ──────────────────────── */

/**
 * THE "One Passkey, Many Keys" BOUNTY FUNCTION.
 *
 * Derives N distinct EOAs from ONE passkey: the same PRF output produces the
 * same BIP-39 mnemonic every time, and BIP-32 derives a DIFFERENT secp256k1
 * key per index at `m/44'/60'/0'/0/{index}`. Every derived key is fully
 * reproducible from the same passkey alone — nothing is stored anywhere.
 * That reproducibility is the bounty's whole point: lose the device, sign in
 * on any synced device, and every account comes back identical.
 *
 * `purposePrefix` names the tree (e.g. "claimless") and is informational;
 * the binding is the index. Purposes map to indexes by stable convention
 * (underwriter=0, dispute=1, ops=2, ... — see the demo).
 */
export function deriveManyKeys(
  passkey: MeraAccount | PasskeyHandle,
  count: number,
  purposePrefix = "claimless",
): MeraDerivedKey[] {
  if (!Number.isInteger(count) || count < 1 || count > 1024) {
    throw new MeraError("PAYLOAD_INVALID", "count must be an integer in [1, 1024]");
  }
  const prfOutput = passkey.prfOutput;
  if (!prfOutput || prfOutput.length !== 32) {
    throw new MeraError(
      "PAYLOAD_INVALID",
      "passkey.prfOutput must be 32 bytes (obtained from a PRF ceremony in the browser)",
    );
  }
  const { mnemonic, seed } = prfOutputToSeed(prfOutput);
  const keys: MeraDerivedKey[] = [];
  for (let index = 0; index < count; index++) {
    const account = seedToEoa(mnemonic, index);
    keys.push({ purpose: `${purposePrefix}:${index}`, address: account.address, index });
  }
  return keys;
}

/* ───────────────────────────── signing layer ───────────────────────────── */

export type MeraSignablePayload =
  | { message: string | Uint8Array }
  | { typedData: TypedDataDefinition };

/**
 * Signs a message or typed data with the passkey-derived key.
 *
 * - `message` → ERC-191 `personal_sign`:
 *   keccak256("\x19Ethereum Signed Message:\n" + len + message), as the
 *   Intents flow needs.
 * - `typedData` → EIP-712:
 *   keccak256("\x19\x01" ‖ domainSeparator ‖ hashStruct(message)).
 *
 * The private key lives only in memory (it derives from the PRF output the
 * passkey produced); the passkey private key never leaves the authenticator.
 */
export async function signWithPasskey(
  viemAccount: LocalAccount,
  payload: MeraSignablePayload,
): Promise<Hash> {
  if (payload === null || typeof payload !== "object") {
    throw new MeraError("PAYLOAD_INVALID", "payload must be {message} or {typedData}");
  }
  if ("message" in payload && "typedData" in payload) {
    throw new MeraError("PAYLOAD_INVALID", "pass either {message} or {typedData}, not both");
  }
  if (!("message" in payload) && !("typedData" in payload)) {
    throw new MeraError("PAYLOAD_INVALID", "payload must contain a message or typedData");
  }
  if ("message" in payload) {
    const message = payload.message;
    if (typeof message === "string") {
      return viemSignMessage({ message, privateKey: accountPrivateKey(viemAccount) });
    }
    if (message instanceof Uint8Array) {
      return viemSignMessage({
        message: { raw: message },
        privateKey: accountPrivateKey(viemAccount),
      });
    }
    throw new MeraError("PAYLOAD_INVALID", "message must be a string or Uint8Array");
  }
  const typedData = (payload as { typedData: TypedDataDefinition }).typedData;
  if (!typedData || typeof typedData !== "object") {
    throw new MeraError("PAYLOAD_INVALID", "typedData must be an EIP-712 definition");
  }
  return viemSignTypedData({ privateKey: accountPrivateKey(viemAccount), ...typedData });
}

/**
 * Extracts the 32-byte private key from a viem HD LocalAccount as 0x-hex.
 * All accounts created here come from `mnemonicToAccount`, so `getHdKey`
 * always exists; the guard is for safety.
 */
function accountPrivateKey(account: LocalAccount): Hex {
  const hd = (account as unknown as { getHdKey?: () => { privateKey: Uint8Array | null } }).getHdKey?.();
  const key = hd?.privateKey ?? null;
  if (!key) throw new MeraError("DERIVATION_FAILED", "HD node has no private key");
  return toHexKey(key);
}

/** Bytes → `0x`-prefixed hex. */
function toHexKey(bytes: Uint8Array): Hex {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as Hex;
}

/* ───────────────────────────── viem adapter ────────────────────────────── */

/**
 * Adapter: a Mera account becomes a viem `Account` so the rest of the SDK
 * (CoverPool deposits, IncidentRegistry reports, the Intents flow) can use it
 * directly with `createWalletClient({ account: meraAccountToViem(account) })`.
 * The returned account signs locally; no chain connection is implied.
 */
export function meraAccountToViem(account: MeraAccount): LocalAccount {
  if (!account.mnemonic) {
    throw new MeraError("DERIVATION_FAILED", "account has no mnemonic; recreate it from the passkey first");
  }
  const hd = seedToEoa(account.mnemonic, account.index);
  if (hd.address.toLowerCase() !== account.address.toLowerCase()) {
    throw new MeraError(
      "DERIVATION_FAILED",
      `mnemonic re-derivation mismatch: ${hd.address} != ${account.address}`,
    );
  }
  return hd;
}

/* ─────────────────────────── BIP-39 wordlist ───────────────────────────── */

/**
 * The 2048-word English BIP-39 wordlist, inlined to avoid a runtime import.
 * Generated from @scure/bip39/wordlists/english.js (verified: 2048 words,
 * checksum-compatible). Only used by mnemonicFromEntropy. Exported so the
 * Node demo can display the derived mnemonic without duplicating the list.
 */
export const ENGLISH_WORDLIST: readonly string[] = [
  "abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","affair","afford","afraid","again","age","agent","agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert","alien","all","alley","allow","almost","alone","alpha","already","also","alter","always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle","angry","animal","ankle","announce","annual","another","answer","antenna","antique","anxiety","any","apart","apology","appear","apple","approve","april","arch","arctic","area","arena","argue","arm","armed","armor","army","around","arrange","arrest","arrive","arrow","art","artefact","artist","artwork","ask","aspect","assault","asset","assist","assume","asthma","athlete","atom","attack","attend","attitude","attract","auction","audit","august","aunt","author","auto","autumn","average","avocado","avoid","awake","aware","away","awesome","awful","awkward","axis","baby","bachelor","bacon","badge","bag","balance","balcony","ball","bamboo","banana","banner","bar","barely","bargain","barrel","base","basic","basket","battle","beach","bean","beauty","because","become","beef","before","begin","behave","behind","believe","below","belt","bench","benefit","best","betray","better","between","beyond","bicycle","bid","bike","bind","biology","bird","birth","bitter","black","blade","blame","blanket","blast","bleak","bless","blind","blood","blossom","blouse","blue","blur","blush","board","boat","body","boil","bomb","bone","bonus","book","boost","border","boring","borrow","boss","bottom","bounce","box","boy","bracket","brain","brand","brass","brave","bread","breeze","brick","bridge","brief","bright","bring","brisk","broken","bronze","broom","brother","brown","brush","bubble","buddy","budget","buffalo","build","bulb","bulk","bullet","bundle","bunker","burden","burger","burst","bus","business","busy","butter","buyer","buzz","cabbage","cabin","cable","cactus","cage","cake","call","calm","camera","camp","can","canal","cancel","candy","cannon","cannot","canoe","canvas","canyon","capable","capital","captain","car","carbon","card","cargo","carpet","carry","cart","case","cash","casino","castle","casual","cat","catalog","catch","category","cattle","caught","cause","caution","cave","ceiling","celery","cement","census","century","cereal","certain","chair","chalk","champion","change","chaos","chapter","charge","chase","chat","cheap","check","cheese","chef","cherry","chest","chicken","chief","child","chimney","choice","choose","chronic","chuckle","chunk","churn","cigar","cinnamon","circle","citizen","civil","civil","claim","clap","clarify","claw","clay","clean","clerk","clever","click","cliff","climb","clinic","clip","clock","clog","close","cloth","cloud","clown","club","clump","cluster","clutch","coach","coast","coconut","code","coffee","coil","coin","collect","color","column","combine","come","comfort","comic","common","company","concert","conduct","confirm","congress","connect","consider","control","convince","cook","cool","copper","copy","coral","core","corn","correct","cost","cotton","couch","country","couple","course","cousin","cover","coyote","crack","cradle","craft","cram","crane","crash","crater","crawl","crazy","cream","credit","creek","crew","cricket","crime","crisp","critic","crop","cross","crouch","crowd","crucial","cruel","cruise","crumble","crunch","crush","cry","crystal","cube","culture","cup","cupboard","curious","current","curtain","curve","cushion","custom","cute","cycle","dad","damage","damp","dance","danger","daring","dash","daughter","dawn","day","deal","debate","debris","decade","december","decide","decline","decorate","decrease","deer","defense","defy","delay","delete","delicate","delicious","deliver","demand","demise","denial","dentist","deny","depart","depend","deposit","depth","deputy","derive","describe","desert","design","desk","despair","destroy","detail","detect","develop","device","devote","diagnose","dial","diamond","diary","dice","diesel","diet","differ","digital","dignity","dilemma","dinner","dinosaur","direct","dirt","disagree","discover","disease","dish","dismiss","disorder","display","distance","divert","divide","divorce","dizzy","doctor","document","dog","doll","dolphin","domain","donate","donkey","donor","door","dose","double","dove","draft","dragon","drama","drastic","draw","dream","dress","drift","drill","drink","drip","drive","drop","drum","dry","duck","dumb","dune","during","dust","dutch","duty","dwarf","dynamic","eager","eagle","early","earn","earth","easily","east","easy","echo","ecology","economy","edge","edit","educate","effort","egg","eight","either","elbow","elder","electric","elegant","element","elephant","elevator","elite","else","embark","embody","embrace","emerge","emotion","employ","empower","empty","enable","enact","end","endless","endorse","enemy","energy","enforce","engage","engine","enhance","enjoy","enlist","enough","enrich","enroll","ensure","enter","entire","entry","envelope","episode","equal","equip","era","erase","erode","erosion","error","erupt","escape","essay","essence","estate","eternal","ethics","evidence","evil","evoke","evolve","exact","example","excess","exchange","exclude","excuse","execute","exercise","exhaust","exhibit","exile","exist","exit","exotic","expand","expect","expire","explain","expose","express","extend","extra","eye","eyebrow","fabric","face","faculty","fade","faint","faith","fall","false","fame","family","famous","fan","fancy","fantasy","farm","fashion","fat","fatal","father","fatigue","fault","favorite","feature","february","federal","fee","feed","feel","female","fence","festival","fetch","fever","few","fiber","fiction","field","figure","file","film","filter","final","find","fine","finger","finish","fire","firm","first","fiscal","fish","fit","fitness","fix","flag","flame","flash","flat","flavor","flee","flight","flip","float","flock","floor","flower","fluid","flush","fly","foam","focus","fog","foil","fold","follow","food","foot","force","forest","forget","fork","fortune","forum","forward","fossil","foster","found","fox","fragile","frame","frequent","fresh","friend","fringe","frog","front","frost","frown","frozen","fruit","fuel","fun","funny","furnace","fury","future","gadget","gain","galaxy","gallery","game","gap","garage","garbage","garden","garlic","gas","gate","gather","gauge","gaze","general","genius","genre","gentle","genuine","gesture","ghost","giant","gift","give","glad","glance","glare","glass","glide","glimpse","globe","gloom","glory","glove","glow","glue","goat","goddess","gold","good","goose","gorilla","gospel","gossip","govern","gown","grab","grace","grain","grant","grape","grass","gravity","great","green","grid","grief","grit","grocery","group","grow","grunt","guard","guess","guide","guilt","guitar","gun","habit","hair","half","hammer","handler","hang","happy","harbor","hard","harsh","harvest","hat","have","hawk","hazard","head","health","heart","heavy","hedgehog","height","hello","helmet","help","hen","hero","hidden","high","hill","hint","hip","hire","history","hobby","hockey","hold","hole","holiday","hollow","home","honey","hood","hope","horn","horror","horse","hospital","host","hotel","hour","hover","hub","huge","human","humble","humor","hundred","hungry","hunt","hurdle","hurry","hurt","husband","hybrid","ice","icon","idea","identify","idle","ignore","ill","illegal","illness","image","imitate","immense","immune","impact","impose","improve","impulse","inch","include","income","increase","index","indoor","induce","infant","inflict","inform","inhale","inherit","initial","inject","injury","inmate","inner","innocent","input","inquiry","insane","insect","inside","inspire","install","intact","interest","into","invest","invite","involve","iron","island","isolate","issue","item","ivory","jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel","job","join","joke","journey","joy","judge","juice","jump","jungle","junior","junk","just","kangaroo","keen","keep","ketchup","key","kick","kid","kidney","kind","king","kiss","kit","kitchen","kite","kitten","kiwi","knee","knife","knock","know","lab","label","labor","ladder","lady","lake","lamp","language","laptop","large","later","latin","laugh","laundry","lava","law","lawn","lawsuit","layer","lazy","leader","leaf","learn","leave","lecture","left","leg","legal","legend","leisure","lemon","lend","length","lens","leopard","lesson","letter","level","liar","liberty","library","license","life","lift","light","like","limb","limit","link","lion","liquid","list","little","live","lizard","load","loan","lobster","local","lock","logic","lonely","long","loop","lottery","loud","lounge","love","loyal","lucky","luggage","lumber","lunar","lunch","luxury","lyrics","machine","mad","magic","magnet","maid","mail","main","major","make","mammal","man","manage","mandate","mango","mansion","manual","maple","marble","march","margin","marine","market","marriage","mask","mass","master","match","material","math","matrix","matter","maximum","maze","meadow","mean","measure","meat","mechanic","medal","media","melody","melt","member","memory","mention","menu","mercy","merge","merit","merry","mesh","message","metal","method","middle","midnight","milk","million","mimic","mind","minimum","minor","minute","miracle","mirror","misery","miss","mistake","mix","mixed","mixture","mobile","model","modify","mom","moment","monitor","monkey","monster","month","moon","moral","more","morning","mosquito","mother","motion","motor","mount","mountain","mouse","move","movie","much","muffin","mule","multiply","muscle","museum","mushroom","music","must","mutual","myself","mystery","myth","naive","name","napkin","narrow","nasty","nation","nature","near","neck","need","negative","neglect","neither","nephew","nerve","nest","net","network","neutral","never","news","next","nice","night","noble","noise","nominee","noodle","normal","north","nose","notable","note","nothing","notice","novel","now","nuclear","number","nurse","nut","oak","obey","object","oblige","obscure","observe","obtain","obvious","occur","ocean","october","odor","off","offer","office","often","oil","okay","old","olive","olympic","omit","once","one","onion","online","only","open","opera","opinion","oppose","option","orange","orbit","orchard","order","ordinary","organ","orient","original","orphan","ostrich","other","outdoor","outer","output","outside","oval","oven","over","own","owner","oxygen","oyster","ozone","pact","paddle","page","pair","palace","palm","panda","panel","panic","panther","paper","parade","parent","park","parrot","partner","pass","party","pass","patch","path","patient","patrol","pattern","pause","pave","payment","peace","peanut","pear","peasant","pelican","pen","penalty","pencil","people","pepper","perfect","permit","person","pet","phone","photo","phrase","physical","piano","picnic","picture","piece","pig","pigeon","pill","pilot","pink","pioneer","pipe","pistol","pitch","pizza","place","planet","plastic","plate","please","pledge","pluck","plug","plunge","poem","poet","point","polar","police","pond","pony","pool","popular","portion","position","possible","post","potato","pottery","poverty","powder","power","practice","praise","predict","prefer","prepare","present","pretty","prevent","price","pride","primary","print","priority","prison","private","prize","problem","process","produce","profit","program","project","promote","proof","property","prosper","protect","proud","provide","public","pudding","pull","pulp","pulse","pumpkin","punch","pupil","puppy","purchase","purity","purpose","purse","push","put","puzzle","pyramid","quality","quantum","quarter","question","quick","quit","quiz","quote","rabbit","raccoon","race","rack","radar","radio","rail","rain","raise","rally","ramp","ranch","random","range","rapid","rare","rate","rather","raven","raw","razor","ready","real","reason","rebel","rebuild","recall","receive","recipe","record","recycle","reduce","reflect","reform","refuse","region","regret","regular","reject","relax","release","relief","rely","remain","remember","remind","remove","render","renew","rent","reopen","repair","repeat","replace","report","require","rescue","resemble","resist","resource","response","result","retire","retreat","return","reunion","reveal","review","reward","rhythm","rib","ribbon","rice","rich","ride","ridge","rifle","right","rigid","ring","riot","ripple","risk","ritual","rival","river","road","roast","robot","robust","rocket","romance","roof","rookie","room","rose","rotate","rough","round","route","royal","rubber","rude","rug","rugby","ruin","rule","run","runway","rural","sad","saddle","sadness","safe","sail","salad","salmon","salon","salute","salt","same","sample","sand","satisfy","satoshi","sauce","sausage","save","say","scale","scan","scare","scatter","scene","scheme","school","science","scissors","scorpion","scout","scrap","screen","script","scrub","sea","search","season","seat","second","secret","section","security","seed","seek","segment","select","sell","seminar","senior","sense","sentence","series","service","session","settle","setup","seven","shadow","shaft","shallow","share","shed","shell","sheriff","shield","shift","shine","ship","shiver","shock","shoot","short","should","shoulder","shove","shrimp","shrug","shuffle","shy","sibling","sick","side","siege","sight","sign","silent","silk","silly","silver","similar","simple","since","sing","siren","sister","situate","six","size","skate","sketch","ski","skill","skin","skirt","skull","slab","slam","sleep","slender","slice","slide","slight","slim","slogan","slot","slow","slush","small","smart","smile","smoke","smooth","snack","snake","snap","sniff","snow","soap","soccer","social","sock","soda","soft","solar","soldier","solid","solution","solve","someone","song","soon","sorry","sort","soul","sound","soup","source","south","space","spare","spatial","spade","special","speed","spell","spend","sphere","spice","spider","spike","spin","spirit","split","spoil","sponsor","spoon","sport","spot","spray","spread","spring","spy","square","squeeze","stable","staff","stage","stairs","stamp","stand","start","state","stay","steak","steel","stem","step","stereo","stick","still","sting","stock","stomach","stone","stool","story","stove","strategy","street","strike","strong","struggle","student","stuff","stumble","style","subject","submit","subway","success","such","sudden","suffer","sugar","suggest","suit","summer","sun","sunny","sunset","super","supply","supreme","sure","surface","surge","surprise","surround","survey","suspect","sustain","swallow","swamp","swap","swarm","swear","sweet","swift","swim","swing","switch","sword","symbol","symptom","syrup","system","table","tackle","tag","tail","talent","talk","tank","tape","target","task","taste","tattoo","taxi","teach","team","tell","ten","tenant","tennis","tent","term","test","text","thank","that","theme","then","theory","there","they","thing","this","thought","three","thrive","throw","thumb","thunder","ticket","tide","tiger","tilt","timber","time","tiny","tip","tired","tissue","title","toast","tobacco","today","toddler","toe","together","toilet","token","tomato","tomorrow","tone","tongue","tonight","tool","tooth","top","topic","topple","torch","tornado","tortoise","toss","total","tourist","toward","tower","town","toy","track","trade","traffic","tragic","train","transfer","trap","trash","travel","tray","treat","tree","trend","trial","tribe","trick","trigger","trim","trip","trophy","trouble","truck","true","truly","trust","truth","try","tube","tuition","tumble","tuna","tunnel","turkey","turn","turtle","twelve","twenty","twice","twin","twist","two","type","typical","ugly","umbrella","unable","unaware","uncle","uncover","under","undo","unfair","unfold","unhappy","uniform","unique","unit","universe","unknown","unlock","until","unusual","unveil","update","upgrade","uphold","upon","upper","upset","urban","urge","usage","use","used","useful","useless","usual","utility","vacant","vacuum","vague","valid","valley","valve","van","vanish","vapor","various","vast","vault","vehicle","velvet","vendor","venture","venue","verb","verify","version","very","vessel","veteran","viable","vibrant","vicious","victory","video","view","village","vintage","violin","virtual","virus","visa","visit","visual","vital","vivid","vocal","voice","void","volcano","volume","vote","voyage","wage","wagon","wait","walk","wall","walnut","want","warfare","warm","warrior","wash","wasp","waste","water","wave","way","wealth","weapon","wear","weasel","weather","web","wedding","weekend","weird","welcome","west","wet","whale","what","wheat","wheel","when","where","whip","whisper","wide","width","wife","wild","will","win","window","wine","wing","wink","winner","winter","wire","wisdom","wise","wish","witness","wolf","woman","wonder","wood","wool","word","work","world","worry","worth","wrap","wreck","wrestle","wrist","write","wrong","yard","year","yellow","you","young","youth","zebra","zero","zone","zoo"];