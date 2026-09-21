/**
 * Runtime address resolution for the Claimless MCP server.
 *
 * Addresses come from contracts/deployments/monad-testnet.json at RUNTIME -
 * nothing is hardcoded here, so a redeploy only needs the deployments file
 * updated. ERC-8004 canonical registry addresses are deterministic per the
 * standard and live in the deployments file too.
 *
 * Resolution order for the deployments file (repo layout varies between a
 * source checkout and an installed npm package):
 *   1. CLAIMLESS_DEPLOYMENTS_FILE env var (explicit override)
 *   2. walk up from this module's directory looking for
 *      contracts/deployments/monad-testnet.json
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineChain, type Address } from "viem";

/** Monad testnet (chain 10143). Kept local so mcp/ does not depend on sdk/. */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

export const MONAD_TESTNET_CHAIN_ID = 10143 as const;

/** Fallback RPC. Only used when MONAD_RPC_URL is not set. */
const DEFAULT_RPC = "https://testnet-rpc.monad.xyz";

export interface DeploymentFile {
  chainId: number;
  network: string;
  erc8004: { identityRegistry: string; reputationRegistry: string };
  contracts: {
    incidentRegistry: string;
    riskScore: string;
    agentIdentity: string;
    [key: string]: string;
  };
}

/** The resolved addresses this server reads and writes. */
export interface DeployedAddresses {
  erc8004Identity: Address;
  erc8004Reputation: Address;
  incidentRegistry: Address;
  riskScore: Address;
  agentIdentity: Address;
}

/** Read-only defaults, overridable per call (CLAIMLESS_DEPLOYMENTS_FILE, MONAD_RPC_URL). */
export interface McpConfig {
  rpcUrl: string;
  privateKey: string | undefined;
  addresses: DeployedAddresses;
}

function moduleDir(): string {
  // dist/addresses.js or src/addresses.ts -> walk up from here.
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Locate contracts/deployments/monad-testnet.json.
 * Explicit env var first, then walk up from the module directory.
 */
export function findDeploymentsFile(): string | undefined {
  const explicit = process.env.CLAIMLESS_DEPLOYMENTS_FILE;
  if (explicit && explicit.length > 0) return explicit;

  let dir = moduleDir();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "contracts", "deployments", "monad-testnet.json");
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const FALLBACK: DeployedAddresses = {
  // Deterministic ERC-8004 canonical registries (same on every chain per network
  // class); the Claimless contracts below are the live Monad-testnet deployment
  // as of 2026-09. Used ONLY if the deployments file cannot be located, so the
  // read tools still work from an installed npm package.
  erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  incidentRegistry: "0xfE23A58f08bCd245ee61cb08dE1d27d2c27c5944",
  riskScore: "0x5cFA4968a9225fd5bCAbF88B6A35A9748E6215F4",
  agentIdentity: "0x6a075C7A2ebcB43F4E08FEd922AaF058437fa4dA",
};

/**
 * Read and validate the deployments file. Throws with a clear message when it
 * is missing or malformed - the server lists tools fine, but writes would
 * target an unknown address, so we refuse to guess.
 */
export function loadAddresses(): { addresses: DeployedAddresses; source: string } {
  const file = findDeploymentsFile();
  if (!file) {
    return { addresses: FALLBACK, source: "bundled fallback (deployments file not found; set CLAIMLESS_DEPLOYMENTS_FILE)" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const d = parsed as Partial<DeploymentFile>;
  if (typeof d.chainId !== "number" || typeof d.network !== "string") {
    throw new Error(`${file}: missing chainId or network`);
  }
  if (d.chainId !== MONAD_TESTNET_CHAIN_ID) {
    throw new Error(
      `${file}: chainId ${d.chainId} is not Monad testnet (${MONAD_TESTNET_CHAIN_ID}). This MCP server is testnet-only for now.`,
    );
  }
  const required: Array<keyof DeploymentFile["contracts"] & string> = [
    "incidentRegistry",
    "riskScore",
    "agentIdentity",
  ];
  const contracts: Partial<DeploymentFile["contracts"]> = d.contracts ?? {};
  const missing = required.filter((k) => typeof contracts[k] !== "string" || (contracts[k] as string).length === 0);
  if (missing.length > 0) {
    throw new Error(`${file}: missing contract addresses: ${missing.join(", ")}`);
  }
  const erc8004: Partial<DeploymentFile["erc8004"]> = d.erc8004 ?? {};
  if (
    typeof erc8004.identityRegistry !== "string" ||
    erc8004.identityRegistry.length === 0 ||
    typeof erc8004.reputationRegistry !== "string" ||
    erc8004.reputationRegistry.length === 0
  ) {
    throw new Error(`${file}: missing erc8004.identityRegistry / erc8004.reputationRegistry`);
  }
  return {
    addresses: {
      erc8004Identity: erc8004.identityRegistry as Address,
      erc8004Reputation: erc8004.reputationRegistry as Address,
      incidentRegistry: contracts.incidentRegistry as Address,
      riskScore: contracts.riskScore as Address,
      agentIdentity: contracts.agentIdentity as Address,
    },
    source: file,
  };
}

/** Full server configuration. Call once at startup. */
export function loadConfig(): McpConfig & { deploymentsSource: string } {
  const { addresses, source } = loadAddresses();
  return {
    rpcUrl: process.env.MONAD_RPC_URL ?? DEFAULT_RPC,
    privateKey: process.env.MONAD_PRIVATE_KEY,
    addresses,
    deploymentsSource: source,
  };
}

/** Format a bigint wei value as a MON decimal string for humans. */
export function formatMon(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n).toString().padStart(18, "0").slice(0, 12);
  return `${negative ? "-" : ""}${whole}.${frac} MON`;
}