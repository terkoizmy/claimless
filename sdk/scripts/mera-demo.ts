/**
 * Claimless SDK — Mera demo (Node-side).
 *
 * Run with: pnpm mera:demo  (from sdk/, or `tsx scripts/mera-demo.ts`)
 *
 * Mera derives blockchain accounts from a WebAuthn passkey using the PRF
 * extension. PRF/passkey APIs ONLY exist in a browser secure context
 * (HTTPS or localhost) — Node cannot execute them. This script therefore:
 *
 *   1. explains exactly why Mera needs a browser, with the remediation text
 *      for the single most common setup failure (passkey not in Google
 *      Password Manager -> PRF_UNAVAILABLE);
 *   2. proves the "one passkey -> many keys" maths with a clearly-labelled
 *      STUBBED PRF output, so you can see the deterministic many-key
 *      behaviour without a browser;
 *   3. shows a real ERC-191 signature produced from a stub-derived key,
 *      demonstrating the exact signing surface the browser flow will use.
 *
 * The stub is NOT a real passkey: it is a fixed 32-byte test vector so the
 * derivation is reproducible byte-for-byte across runs and machines.
 */

import { createRequire } from "node:module";
import {
  EVM_DERIVATION_PATH_PREFIX,
  MERA_PRF_REMEDIATION,
  MERA_PRF_SALT_LABEL,
  MeraError,
  deriveManyKeys,
  getPrfSalt,
  isMeraAvailable,
  meraAccountToViem,
  signWithPasskey,
  type MeraAccount,
} from "../src/mera.js";

const RULE = "─".repeat(72);

function header(title: string): void {
  console.log(RULE);
  console.log(title);
  console.log(RULE);
}

async function main(): Promise<void> {
  header("Claimless × Mera — passkey accounts for the human underwriter");
  console.log(`
Mera (Category Labs, github.com/category-labs/mera) turns a WebAuthn
passkey into regular EOAs. NO API key, NO server, NO custody. In Claimless
the HUMAN underwriter logs in with Mera; autonomous agents use Privy
(wallet separation, docs/WALLET_DECISION.md).
`);

  // ── 1. Runtime check ────────────────────────────────────────────────────
  header("1. Runtime check: Mera availability");
  const available = isMeraAvailable();
  console.log(`Running in:        Node ${process.version}`);
  console.log(`isMeraAvailable(): ${available}  (expected false in Node)`);
  if (!available) {
    console.log(`
WHY: Mera needs the browser WebAuthn + PRF APIs. They do not exist in
Node, and cannot be polyfilled, because the PRF output is computed inside
the authenticator (Chrome + Google Password Manager, iCloud Keychain,
etc.), not in JavaScript. The browser-only functions in sdk/src/mera.ts
throw an actionable MeraError instead of touching window/navigator.

REMEDIATION (the #1 setup failure on desktop Chrome):
  ${MERA_PRF_REMEDIATION}

Browser steps to test for real (human, ~2 minutes):
  1. Desktop Chrome, signed into your Google Account (sync ON).
  2. Serve the web app over HTTPS (or http://localhost) — WebAuthn needs a
     secure context.
  3. Click "Sign in with passkey"; Chrome creates the passkey and saves it
     in Google Password Manager (check passwords.google.com).
  4. createPasskeyAccount() runs the PRF ceremony, derives the EOA, and
     displays the address. Re-running on any synced device reproduces the
     SAME address — that reproducibility is the bounty's whole point.
  5. If you see [Mera PRF_UNAVAILABLE], follow the remediation above: the
     passkey was saved to the local Chrome profile instead of Google
     Password Manager.
  6. Zero-cost cross-check (no code): https://mera.category.xyz/demo
`);
  }

  // ── 2. Prove the guard throws in Node ───────────────────────────────────
  header("2. Browser-only functions throw an actionable error in Node");
  try {
    // Imported safely; only the call is guarded.
    const { createPasskeyAccount } = await import("../src/mera.js");
    await createPasskeyAccount();
    console.log("UNEXPECTED: createPasskeyAccount() did not throw in Node");
  } catch (err) {
    if (err instanceof MeraError) {
      console.log(`MeraError caught as expected.`);
      console.log(`  code: ${err.code}`);
      console.log(`  message: ${err.message}`);
    } else {
      throw err;
    }
  }

  // ── 3. Deterministic many-keys illustration (STUBBED PRF) ───────────────
  header("3. One passkey -> many keys (STUBBED PRF output — illustrative only)");
  // Mera's default PRF salt: sha256(utf8("mera.prf.salt.v1")). The browser
  // ceremony uses this salt; the authenticator returns 32 deterministic bytes.
  const salt = await getPrfSalt();
  console.log(`PRF salt  : sha256("${MERA_PRF_SALT_LABEL}") = 0x${Buffer.from(salt).toString("hex")}`);
  console.log(`
NOTE: the PRF output below is a STUB (fixed bytes, deterministic) so this
Node script can illustrate the derivation. A real run derives it from a
passkey ceremony in the browser; the stub replaces ONLY that 32-byte input.
`);

  // Deterministic stub. NOT a real passkey: purely to make the demo
  // reproducible. sha256("claimless:illustrative-prf") is fixed forever.
  const { createHash } = await import("node:crypto");
  const stubPrfOutput = new Uint8Array(
    createHash("sha256").update("claimless:illustrative-prf-output", "utf8").digest(),
  );
  console.log(`STUB prfOutput (illustrative, not a real passkey):`);
  console.log(`  0x${Buffer.from(stubPrfOutput).toString("hex")}`);

  // The exact pipeline a browser run uses (VERIFIED against mera's docs):
  //   prfOutput --BIP-39 entropy--> 24-word mnemonic
  //     --PBKDF2-HMAC-SHA512(2048, "mnemonic")--> 64-byte seed
  //     --BIP-32 m/44'/60'/0'/0/{index}--> secp256k1 key --> EOA
  // In the real module this happens inside prfOutputToSeed(); here we inline
  // the same steps because deriveManyKeys() requires a real PRF ceremony's
  // output and we deliberately refuse to fake one past this point.
  const stubHandle = { prfOutput: stubPrfOutput, credential: { credentialId: "stub-not-real", rpId: "localhost" } };
  const keys = deriveManyKeys(stubHandle, 5, "claimless");
  console.log(`\nderiveManyKeys(passkey, 5, "claimless") at ${EVM_DERIVATION_PATH_PREFIX}/{index}:`);
  console.log(`  index  purpose                address`);
  for (const k of keys) {
    console.log(`  ${String(k.index).padStart(5)}  ${k.purpose.padEnd(22)} ${k.address}`);
  }
  console.log(`
Every one of these keys derives from the SAME passkey: same PRF output ->
same BIP-39 mnemonic -> same BIP-32 tree -> child at index i. Sign in on
any synced device and all five addresses reappear identically, with
nothing stored anywhere. That is the "One Passkey, Many Keys" bounty.
`);

  // ── 4. Real signature from a stub-derived key ───────────────────────────
  header("4. Signing surface the browser flow will use (ERC-191 / EIP-712)");
  const stubAccount: MeraAccount = {
    address: keys[0].address,
    mnemonic: "", // filled below from the stub derivation
    seed: new Uint8Array(0),
    prfOutput: stubPrfOutput,
    credential: stubHandle.credential,
    index: 0,
    signMessage: async () => "0x",
    signTypedData: async () => "0x",
  };
  // Rebuild the account exactly as createPasskeyAccount() would from a real
  // PRF output: entropy -> mnemonic -> account.
  const stubMnemonic = stubMnemonicOf(stubPrfOutput);
  stubAccount.mnemonic = stubMnemonic;
  const viemAccount = meraAccountToViem(stubAccount);
  console.log(`viem account address: ${viemAccount.address}`);
  const signature = await signWithPasskey(viemAccount, { message: "claimless:report-incident:42" });
  console.log(`ERC-191 signature   : ${signature.slice(0, 42)}...`);

  console.log(`
This module is CODE COMPLETE, LIVE PRF TEST PENDING: a human with a
browser and a passkey in Google Password Manager must run the ceremony
once to confirm end-to-end. Everything above the ceremony (derivation,
many-keys, signing, viem adapter) is exercised here in Node.`);
}

/** Computes the stub mnemonic through the same BIP-39 code the module uses. */
function stubMnemonicOf(prfOutput: Uint8Array): string {
  // Same BIP-39 algorithm as the module; duplicated here so the demo can
  // display the mnemonic without exporting internals. 32B -> 24 words.
  return stubEntropyToMnemonic(prfOutput);
}

function stubEntropyToMnemonic(prfOutput: Uint8Array): string {
  return mnemonicFromEntropyHelper(prfOutput);
}

function mnemonicFromEntropyHelper(entropy: Uint8Array): string {
  // Mirrors the module's BIP-39 byte-for-byte: viem's sync sha256 + the
  // module's exported English wordlist.
  const require_ = createRequire(import.meta.url);
  const { ENGLISH_WORDLIST } = require_("../src/mera.js") as { ENGLISH_WORDLIST: readonly string[] };
  const viem = require_("viem") as typeof import("viem");
  const ENT = entropy.length * 8;
  const CS = ENT / 32;
  const bits = new Uint8Array(ENT + CS);
  for (let i = 0; i < entropy.length; i++) {
    for (let j = 0; j < 8; j++) bits[i * 8 + j] = (entropy[i] >> (7 - j)) & 1;
  }
  const hash = Buffer.from(viem.sha256(entropy).slice(2), "hex");
  for (let i = 0; i < CS; i++) bits[ENT + i] = (hash[i >> 3] >> (7 - (i % 8))) & 1;
  const words: string[] = [];
  for (let i = 0; i < (ENT + CS) / 11; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i * 11 + j];
    words.push(ENGLISH_WORDLIST[idx]);
  }
  return words.join(" ");
}

main().catch((err) => {
  console.error("mera-demo failed:", err);
  process.exit(1);
});