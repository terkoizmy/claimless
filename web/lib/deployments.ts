/**
 * Deployed contract addresses.
 *
 * DO NOT HARDCODE ADDRESSES ANYWHERE ELSE. The single source of truth is
 * contracts/deployments/monad-testnet.json (written by script/Deploy.s.sol).
 * The JSON file next to this module is a copy of it (Next.js cannot import
 * outside its project root); if contracts are redeployed, re-copy it:
 *
 *   copy /Y contracts\deployments\monad-testnet.json web\lib\deployments.json
 */

import raw from "./deployments.json";

export interface MonadTestnetDeployment {
  chainId: number;
  network: string;
  deployer: string;
  erc8004: { identityRegistry: string; reputationRegistry: string };
  cre: { forwarder: string; chainSelector: string };
  contracts: {
    incidentRegistry: string;
    riskScore: string;
    agentIdentity: string;
    coverPool: string;
    parametricTrigger: string;
  };
}

const file = raw as unknown as MonadTestnetDeployment[];

function pick(): MonadTestnetDeployment {
  const entry = file.find((d) => d.chainId === 10143) ?? file[0];
  if (!entry) throw new Error("monad-testnet deployment entry missing in web/lib/deployments.json");
  return entry;
}

export const deployment = pick();

export const CHAIN_ID = deployment.chainId;
export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const EXPLORER_URL = "https://testnet.monadvision.com";

export const ADDRESSES = {
  incidentRegistry: deployment.contracts.incidentRegistry as `0x${string}`,
  riskScore: deployment.contracts.riskScore as `0x${string}`,
  agentIdentity: deployment.contracts.agentIdentity as `0x${string}`,
  coverPool: deployment.contracts.coverPool as `0x${string}`,
  parametricTrigger: deployment.contracts.parametricTrigger as `0x${string}`,
  erc8004Identity: deployment.erc8004.identityRegistry as `0x${string}`,
  erc8004Reputation: deployment.erc8004.reputationRegistry as `0x${string}`,
  creForwarder: deployment.cre.forwarder as `0x${string}`,
};

/** The agent set the dashboard is allowed to display. Small by design. */
export const KNOWN_AGENT_IDS: readonly bigint[] = [10182n, 1867n];

/** Quote parameters for the comparison table (1 MON, 30 days). */
export const QUOTE_AMOUNT = 1_000_000_000_000_000_000n; // 1e18
export const QUOTE_DURATION_SECONDS = 30n * 24n * 60n * 60n; // 30 days

/** Agent watched by the CRE workflow (cre/claimless-trigger/config.staging.json). */
export const FEATURED_AGENT_ID = 10182n;