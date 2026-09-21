/**
 * Mera passkey flow for the browser — no Node imports, so it can be bundled
 * into the static dashboard.
 *
 * This mirrors `sdk/src/mera.ts` (which cannot be bundled because it imports
 * `node:module` at top level). The derivation is identical and is pinned to the
 * authoritative `@scure/bip39` by a known-answer test in
 * `sdk/test/mera.test.ts`:
 *
 *   passkey PRF output (32B)
 *     --BIP-39 entropy--> 24-word mnemonic
 *     --PBKDF2-HMAC-SHA512(2048, "mnemonic")--> 64-byte seed
 *     --BIP-32 m/44'/60'/0'/0/{index}--> secp256k1 key --> EOA
 *
 * Everything here runs only in a browser secure context (HTTPS or localhost).
 */

import { mnemonicToAccount } from "viem/accounts";
import { sha256 } from "viem";
import wordlist from "./bip39-wordlist.json";

/** Mera's fixed, version-stable PRF salt label. */
export const MERA_PRF_SALT_LABEL = "mera.prf.salt.v1";

/** BIP-44 Ethereum path prefix used for numbered EVM accounts. */
export const EVM_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";

/** Remediation for the most common desktop-Chrome setup failure. */
export const MERA_PRF_REMEDIATION =
  "Mera needs a PRF-capable passkey. On desktop Chrome, only passkeys stored in " +
  "Google Password Manager return PRF output; passkeys saved to the local Chrome " +
  "profile throw PRF_UNAVAILABLE. Fix: make sure Chrome is signed in and syncing " +
  "(passwords.google.com), serve this page over HTTPS or http://localhost, and let " +
  "Chrome save the passkey into Google Password Manager. Then retry.";

export class MeraError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[Mera ${code}] ${message}`);
    this.name = "MeraError";
  }
}

export interface MeraCredentialMetadata {
  credentialId: string;
  rpId: string;
}

export interface DerivedKey {
  purpose: string;
  address: string;
  index: number;
}

export interface PasskeyResult {
  prfOutput: Uint8Array;
  credential: MeraCredentialMetadata;
  /** Primary account address (index 0). */
  address: string;
  /** "One passkey, many keys": N derived EOAs from the same passkey. */
  keys: DerivedKey[];
}

/* --------------------------------- guards -------------------------------- */

export function isMeraAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    window.isSecureContext === true
  );
}

function requireSecureContext(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new MeraError("BROWSER_UNAVAILABLE", "Mera requires a browser.");
  }
  if (window.isSecureContext !== true) {
    throw new MeraError("SECURE_CONTEXT", "WebAuthn requires HTTPS or http://localhost.");
  }
  if (typeof window.PublicKeyCredential === "undefined") {
    throw new MeraError("BROWSER_UNAVAILABLE", "PublicKeyCredential is unavailable.");
  }
}

/* ------------------------------ utilities -------------------------------- */

function random32(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** The 32-byte PRF salt: sha256(utf8("mera.prf.salt.v1")). */
export async function getPrfSalt(): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(MERA_PRF_SALT_LABEL));
  return new Uint8Array(digest);
}

/* --------------------------- key derivation ------------------------------ */

/**
 * 32 bytes of entropy -> 24-word BIP-39 mnemonic. Standard algorithm:
 * 11-bit word indices over (entropy ‖ checksum), checksum = first ENT/32 bits
 * of sha256(entropy).
 */
export function entropyToMnemonic(entropy: Uint8Array): string {
  if (entropy.length !== 32) {
    throw new MeraError("DERIVATION_FAILED", `entropy must be 32 bytes, got ${entropy.length}`);
  }
  const ENT = entropy.length * 8; // 256
  const CS = ENT / 32; // 8
  const bits = new Uint8Array(ENT + CS);
  for (let i = 0; i < entropy.length; i++) {
    for (let j = 0; j < 8; j++) bits[i * 8 + j] = (entropy[i] >> (7 - j)) & 1;
  }
  const hashHex = sha256(entropy);
  const hash = new Uint8Array((hashHex.length - 2) / 2);
  for (let i = 0; i < hash.length; i++) hash[i] = parseInt(hashHex.slice(2 + i * 2, 4 + i * 2), 16);
  for (let i = 0; i < CS; i++) bits[ENT + i] = (hash[i >> 3] >> (7 - (i % 8))) & 1;

  const words: string[] = [];
  for (let i = 0; i < (ENT + CS) / 11; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i * 11 + j];
    words.push((wordlist as string[])[idx]);
  }
  return words.join(" ");
}

/** Address at `m/44'/60'/0'/0/{index}` from a mnemonic. */
export function addressAt(mnemonic: string, index: number): string {
  return mnemonicToAccount(mnemonic, { accountIndex: 0, changeIndex: 0, addressIndex: index }).address;
}

/** Derives N distinct EOAs from one 32-byte PRF output. */
export function deriveManyKeys(
  prfOutput: Uint8Array,
  count: number,
  purposePrefix = "claimless",
): DerivedKey[] {
  if (!Number.isInteger(count) || count < 1 || count > 1024) {
    throw new MeraError("PAYLOAD_INVALID", "count must be an integer in [1, 1024]");
  }
  if (prfOutput.length !== 32) {
    throw new MeraError("PAYLOAD_INVALID", "PRF output must be 32 bytes");
  }
  const mnemonic = entropyToMnemonic(prfOutput);
  const keys: DerivedKey[] = [];
  for (let index = 0; index < count; index++) {
    keys.push({ purpose: `${purposePrefix}:${index}`, address: addressAt(mnemonic, index), index });
  }
  return keys;
}

/* ----------------------------- ceremonies -------------------------------- */

/** Runs a PRF assertion against an existing passkey ("sign in"). */
export async function getPasskeyPrfOutput(opts: {
  rpId?: string;
  credentialId?: string;
}): Promise<{ prfOutput: Uint8Array; credential: MeraCredentialMetadata }> {
  requireSecureContext();
  const rpId = opts.rpId ?? window.location.hostname;
  const salt = await getPrfSalt();

  const allowCredentials =
    opts.credentialId !== undefined
      ? [{ type: "public-key" as const, id: b64urlDecode(opts.credentialId) }]
      : [];

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: random32(),
        rpId,
        timeout: 120_000,
        userVerification: "required",
        allowCredentials,
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new MeraError("CEREMONY_FAILED", err instanceof Error ? err.message : String(err));
  }
  if (!assertion) throw new MeraError("CEREMONY_FAILED", "No credential selected.");

  const results = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const first = results.prf?.results?.first;
  if (!first) throw new MeraError("PRF_UNAVAILABLE", MERA_PRF_REMEDIATION);

  const prfOutput = new Uint8Array(first);
  if (prfOutput.length !== 32) {
    throw new MeraError(
      "PRF_UNAVAILABLE",
      `Authenticator returned ${prfOutput.length} bytes. ${MERA_PRF_REMEDIATION}`,
    );
  }
  return {
    prfOutput,
    credential: { credentialId: b64urlEncode(new Uint8Array(assertion.rawId)), rpId },
  };
}

/** Creates a passkey WITH the PRF extension and derives the account(s). */
export async function createPasskeyAccount(
  opts: {
    rpId?: string;
    rpName?: string;
    userName?: string;
    userDisplayName?: string;
    /** How many "one passkey, many keys" accounts to derive (default 5). */
    keyCount?: number;
  } = {},
): Promise<PasskeyResult> {
  requireSecureContext();
  const rpId = opts.rpId ?? window.location.hostname;

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: random32(),
        rp: { id: rpId, name: opts.rpName ?? "Claimless" },
        user: {
          id: random32(),
          name: opts.userName ?? "claimless-underwriter",
          displayName: opts.userDisplayName ?? "Claimless Underwriter",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 120_000,
        attestation: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new MeraError("CEREMONY_FAILED", err instanceof Error ? err.message : String(err));
  }
  if (!credential) throw new MeraError("CEREMONY_FAILED", "Passkey creation was cancelled.");

  const credentialId = b64urlEncode(new Uint8Array(credential.rawId));
  const created = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const first = created.prf?.results?.first;

  let prfOutput: Uint8Array;
  if (first) {
    prfOutput = new Uint8Array(first);
    if (prfOutput.length !== 32) throw new MeraError("PRF_UNAVAILABLE", MERA_PRF_REMEDIATION);
  } else {
    // Some authenticators evaluate PRF only on assertion, not at creation.
    const handle = await getPasskeyPrfOutput({ rpId, credentialId });
    prfOutput = handle.prfOutput;
  }

  const keys = deriveManyKeys(prfOutput, opts.keyCount ?? 5, "claimless");
  return {
    prfOutput,
    credential: { credentialId, rpId },
    address: keys[0].address,
    keys,
  };
}
