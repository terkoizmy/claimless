/**
 * Claimless contract configuration for the MetaMask Agent Wallet plugin.
 *
 * Addresses are read at runtime from `contracts/deployments/monad-testnet.json`
 * when the file is present (plugin run inside the monorepo), with a
 * documented fallback to the verified Monad-testnet deployments so a published
 * npm package works standalone.
 *
 * VERIFIED (docs.metamask.io/agent-wallet/reference/supported-chains/):
 *   Monad Testnet chainId 10143 and Monad Mainnet chainId 143 are both
 *   natively preconfigured in MetaMask Agent Wallet.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Monad Testnet (chain 10143) — preconfigured in MetaMask Agent Wallet. */
export const MONAD_TESTNET_CHAIN_ID = 10143;

/** Monad Mainnet (chain 143) — preconfigured and Transaction Shield "Covered". */
export const MONAD_MAINNET_CHAIN_ID = 143;

/** Default network for every command in this plugin. */
export const DEFAULT_CHAIN_ID = MONAD_TESTNET_CHAIN_ID;

/** Documented fallback addresses (Monad testnet, deployed 2026-09-15). */
export const FALLBACK_ADDRESSES = {
  incidentRegistry: "0xfE23A58f08bCd245ee61cb08dE1d27d2c27c5944",
  riskScore: "0x5cFA4968a9225fd5bCAbF88B6A35A9748E6215F4",
  agentIdentity: "0x6a075C7A2ebcB43F4E08FEd922AaF058437fa4dA",
  coverPool: "0x93634116bDDfeE1098491c839DDDfd7BaA8b7f30",
  parametricTrigger: "0xC5F875721E60C3198dA99Aaa639914e64fb15D12",
} as const;

/** Canonical ERC-8004 registries (deterministic upstream deployments). */
export const ERC8004_REGISTRIES = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
} as const;

/** The fixed Claimless taxonomy tag on every pushed risk summary. */
export const TAG1_INCIDENT = "claimless:incident";

/** Contract address set this plugin reads from. */
export type ClaimlessAddresses = {
  incidentRegistry: string;
  riskScore: string;
  agentIdentity: string;
  coverPool: string;
  parametricTrigger: string;
};

/** Load addresses from the monorepo deployment file when it exists. */
export async function loadAddresses(): Promise<ClaimlessAddresses> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/commands/claimless/x.js -> plugin root is ../../.. ; src/lib/x.ts -> ../..
  const candidates = [
    path.resolve(here, "..", "..", "..", "contracts", "deployments", "monad-testnet.json"),
    path.resolve(here, "..", "..", "contracts", "deployments", "monad-testnet.json"),
    path.resolve(here, "..", "..", "..", "..", "contracts", "deployments", "monad-testnet.json"),
  ];
  for (const deploymentPath of candidates) {
    try {
      const raw = await readFile(deploymentPath, "utf8");
      const parsed = JSON.parse(raw) as {
        contracts?: Partial<Record<keyof ClaimlessAddresses, string>>;
      };
      const c = parsed.contracts ?? {};
      const pick = (key: keyof ClaimlessAddresses, fallback: string) =>
        typeof c[key] === "string" && (c[key] as string).startsWith("0x")
          ? (c[key] as string)
          : fallback;
      return {
        incidentRegistry: pick("incidentRegistry", FALLBACK_ADDRESSES.incidentRegistry),
        riskScore: pick("riskScore", FALLBACK_ADDRESSES.riskScore),
        agentIdentity: pick("agentIdentity", FALLBACK_ADDRESSES.agentIdentity),
        coverPool: pick("coverPool", FALLBACK_ADDRESSES.coverPool),
        parametricTrigger: pick("parametricTrigger", FALLBACK_ADDRESSES.parametricTrigger),
      };
    } catch {
      // try the next candidate; if all fail, fall back below
    }
  }
  // Published package: fall back to the documented deployment.
  return { ...FALLBACK_ADDRESSES };
}

/** Shared, cached address bundle. */
let cachedAddresses: ClaimlessAddresses | undefined;

export async function getAddresses(): Promise<ClaimlessAddresses> {
  if (!cachedAddresses) {
    cachedAddresses = await loadAddresses();
  }
  return cachedAddresses;
}

/** Format wei as a compact MON amount string. */
export function formatWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${frac} MON (${wei.toString()} wei)`;
}

/** Shorten an address, e.g. 0xfE23…5944. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Score band, mirroring sdk/src/risk.ts thresholds (100 = clean). */
export function scoreBand(score: number): "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL" {
  if (score >= 90) return "LOW";
  if (score >= 70) return "MODERATE";
  if (score >= 40) return "ELEVATED";
  return "CRITICAL";
}