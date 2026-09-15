/**
 * Hashing helpers shared by the SDK and agents.
 *
 * `kind` on chain is a bytes32, produced as keccak256 of a short ASCII string
 * (e.g. "SLA_BREACH"). Evidence hashes are keccak256 of a canonical JSON payload.
 */

import { keccak256, toHex, stringToHex } from "viem";
import type { IncidentKind } from "./config.js";

/** keccak256 of the kind string, as the contract expects. */
export function kindHash(kind: IncidentKind | string): `0x${string}` {
  return keccak256(stringToHex(kind));
}

/**
 * Hash an arbitrary payload into an evidence commitment.
 * The payload itself stays off-chain; only this commitment goes on chain.
 */
export function evidenceHash(payload: unknown): `0x${string}` {
  const canonical = typeof payload === "string" ? payload : stableStringify(payload);
  return keccak256(toHex(canonical));
}

/** Deterministic JSON so the same object always hashes the same way. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
