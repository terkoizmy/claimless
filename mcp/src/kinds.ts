/**
 * Incident-kind helpers shared by the tools.
 *
 * On-chain `kind` is bytes32 = keccak256(utf8 string), so the human-readable
 * string is hashed on the way in (same convention as sdk/src/hash.ts#kindHash).
 * The six canonical kinds below mirror sdk/src/config.ts INCIDENT_KINDS.
 */

import { keccak256, stringToHex, toHex } from "viem";

/** Common failure kinds. Hash with kindHash before submission. */
export const INCIDENT_KINDS = [
  "SLA_BREACH",
  "WRONG_OUTPUT",
  "LATENCY",
  "UNAVAILABLE",
  "UNAUTHORIZED_ACTION",
  "DATA_LEAK",
] as const;

/** keccak256 of the kind string, as the contract expects. */
export function kindHash(kind: string): `0x${string}` {
  return keccak256(stringToHex(kind));
}

/** Reverse lookup: bytes32 kind commitment -> canonical name, when it is one of ours. */
const NAME_BY_HASH = new Map<string, string>(
  INCIDENT_KINDS.map((k) => [kindHash(k).toLowerCase(), k]),
);

/**
 * The canonical kind name for an on-chain bytes32 commitment, or undefined when
 * the reporter used a non-canonical kind (the raw hash is still returned).
 */
export function kindNameFromHash(hash: string): string | undefined {
  return NAME_BY_HASH.get(hash.toLowerCase());
}

/**
 * Hash an arbitrary JSON-serialisable payload into an evidence commitment
 * (keccak256 of the JSON text; the payload itself stays off-chain).
 * Same convention as sdk/src/hash.ts#evidenceHash.
 */
export function evidenceHashFromPayload(payload: unknown): `0x${string}` {
  const canonical = typeof payload === "string" ? payload : JSON.stringify(payload);
  return keccak256(toHex(canonical));
}