/** Display formatters. All formatting is view-only; no data is invented here. */

export function formatEther(wei: bigint, maxFrac = 4): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (frac === 0n) return `${whole}`;
  let fracStr = frac.toString().padStart(18, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (fracStr.length === 0) fracStr = "…"; // nonzero but below display precision
  return `${whole}.${fracStr}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `0x${hash.slice(2, 8)}…${hash.slice(-4)}`;
}

/** 1e4 fixed-point multiplier -> human string, e.g. 50000 -> "5.00x". */
export function multiplierHuman(fp: bigint): string {
  return `${Number(fp) / 10_000}x`;
}

export function bpsHuman(bps: bigint | number): string {
  return `${(Number(bps) / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

export function explorerAddressUrl(addr: string): string {
  return `https://testnet.monadvision.com/address/${addr}`;
}

export function explorerTxUrl(txHash: string): string {
  return `https://testnet.monadvision.com/tx/${txHash}`;
}

export const INCIDENT_KIND_NAMES: Record<string, string> = {
  "0x0fd90312ffb7e7a71f0c79320bfe58b989e5a2601cb8d9e732c85ecaaa6007a9": "SLA_BREACH",
};

export function kindName(kindHash: string): string {
  return INCIDENT_KIND_NAMES[kindHash.toLowerCase()] ?? shortHash(kindHash);
}

export const SEVERITY_NAMES = ["NONE", "MINOR", "MODERATE", "MAJOR", "CRITICAL", "CATASTROPHIC"] as const;

export function severityName(sev: number): string {
  return SEVERITY_NAMES[sev] ?? `SEV_${sev}`;
}