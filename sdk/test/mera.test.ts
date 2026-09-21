/**
 * Mera determinism tests.
 *
 * What CAN be proven without a browser: given the same 32-byte PRF output, the
 * derivation is fully deterministic and reproducible. That is the entire claim
 * behind "One Passkey, Many Keys" — the passkey only supplies 32 bytes; every
 * address after that is pure math.
 *
 * What CANNOT be proven here: that a real passkey ceremony returns those 32
 * bytes. That needs a browser with a PRF-capable passkey (Google Password
 * Manager). The test is explicit about the boundary rather than pretending.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
// Import the compiled output: the test runner uses `--experimental-strip-types`,
// which strips types but does not rewrite `./x.js` specifiers to `./x.ts`, so a
// src/ import cannot resolve. `npm run build` must run before `npm test`.
import { deriveManyKeys, ENGLISH_WORDLIST } from "../dist/mera.js";
// The authoritative reference implementation, used as a known-answer oracle.
import { entropyToMnemonic as scureEntropyToMnemonic } from "@scure/bip39";
import { wordlist as scureEnglish } from "@scure/bip39/wordlists/english";
import { mnemonicToAccount } from "viem/accounts";

/** A fixed 32-byte PRF output, standing in for a browser ceremony result. */
const PRF = new Uint8Array(32).fill(0x1f);

/*
 * REGRESSION (found 2026-09-21): the inlined BIP-39 wordlist was CORRUPT — 2035
 * words instead of 2048, silently missing 13 entries from index 16 ("acoustic")
 * onward. Every derivation still looked self-consistent (same input -> same
 * output), so the determinism tests above passed while the ADDRESSES WERE WRONG
 * and did not match Mera's reference implementation. These tests pin the
 * derivation to the authoritative @scure/bip39 as a known-answer oracle.
 */
test("wordlist: exactly 2048 words, byte-identical to @scure/bip39", () => {
  assert.equal(ENGLISH_WORDLIST.length, 2048, "BIP-39 English list must be 2048 words");
  assert.deepEqual([...ENGLISH_WORDLIST], [...scureEnglish], "wordlist must match @scure/bip39 exactly");
});

test("derivation: matches the authoritative @scure/bip39 known-answer vector", () => {
  const expectedMnemonic = scureEntropyToMnemonic(PRF, scureEnglish);
  const expected0 = mnemonicToAccount(expectedMnemonic, {
    accountIndex: 0,
    changeIndex: 0,
    addressIndex: 0,
  }).address;

  const keys = deriveManyKeys({ prfOutput: PRF } as never, 1, "claimless");
  assert.equal(
    keys[0].address,
    expected0,
    "index 0 must equal the address derived by the reference BIP-39/BIP-44 implementation",
  );
});

test("deriveManyKeys: same PRF output yields the same addresses", () => {
  const a = deriveManyKeys({ prfOutput: PRF } as never, 5, "claimless");
  const b = deriveManyKeys({ prfOutput: PRF } as never, 5, "claimless");

  assert.equal(a.length, 5);
  assert.deepEqual(
    a.map((k) => k.address),
    b.map((k) => k.address),
    "two runs from the same PRF output must be identical",
  );
});

test("deriveManyKeys: distinct indexes yield distinct addresses", () => {
  const keys = deriveManyKeys({ prfOutput: PRF } as never, 5, "claimless");
  const unique = new Set(keys.map((k) => k.address));
  assert.equal(unique.size, 5, "all 5 derived addresses must be distinct");
});

test("deriveManyKeys: a different PRF output yields different addresses", () => {
  const other = new Uint8Array(32).fill(0x2a);
  const a = deriveManyKeys({ prfOutput: PRF } as never, 1, "claimless");
  const b = deriveManyKeys({ prfOutput: other } as never, 1, "claimless");
  assert.notEqual(a[0].address, b[0].address, "a different passkey must not collide");
});

test("deriveManyKeys: addresses are well-formed EVM addresses", () => {
  const keys = deriveManyKeys({ prfOutput: PRF } as never, 3, "claimless");
  for (const k of keys) {
    assert.match(k.address, /^0x[0-9a-fA-F]{40}$/, `${k.address} must be 42 chars`);
  }
});

test("deriveManyKeys: purpose labels follow the documented convention", () => {
  const keys = deriveManyKeys({ prfOutput: PRF } as never, 3, "claimless");
  assert.deepEqual(
    keys.map((k) => k.purpose),
    ["claimless:0", "claimless:1", "claimless:2"],
  );
  assert.deepEqual(
    keys.map((k) => k.index),
    [0, 1, 2],
  );
});

test("deriveManyKeys: a wrong-length PRF output is rejected", () => {
  // 31 bytes, not 32. Must fail loudly rather than derive weak keys.
  const bad = new Uint8Array(31).fill(0x1f);
  assert.throws(
    () => deriveManyKeys({ prfOutput: bad } as never, 1, "claimless"),
    (err: unknown) => {
      const e = err as { code?: string };
      return e.code === "PAYLOAD_INVALID" || /32 bytes/.test(String(err));
    },
  );
});

test("deriveManyKeys: count bounds are enforced", () => {
  assert.throws(() => deriveManyKeys({ prfOutput: PRF } as never, 0, "claimless"));
  assert.throws(() => deriveManyKeys({ prfOutput: PRF } as never, 1025, "claimless"));
});

test("deriveManyKeys: index 0 is stable across purpose prefixes", () => {
  // The BINDING is the index; the prefix is informational only (see the doc
  // comment). If this ever diverges, the documented invariant is broken.
  const a = deriveManyKeys({ prfOutput: PRF } as never, 1, "claimless");
  const b = deriveManyKeys({ prfOutput: PRF } as never, 1, "otherapp");
  assert.equal(a[0].address, b[0].address, "prefix must not change the derived key");
});
