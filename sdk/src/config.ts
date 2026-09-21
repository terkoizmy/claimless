/**
 * Claimless SDK — shared configuration.
 *
 * All addresses come from `contracts/deployments/monad-testnet.json` (the real
 * deployment) so there is a single source of truth. Env vars can override.
 */

export const MONAD_TESTNET_CHAIN_ID = 10143 as const;

/** Canonical ERC-8004 registries. Deterministic across chains, never forked. */
export const ERC8004 = {
  testnet: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  mainnet: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
} as const;

/**
 * Claimless contracts, deployed and source-verified on Monad testnet.
 * These mirror `contracts/deployments/monad-testnet.json` (the single source of
 * truth written by script/Deploy.s.sol). If contracts are redeployed, update
 * that file first, then re-copy the values here.
 * Verify live with: `cast code <address> --rpc-url https://testnet-rpc.monad.xyz`
 */
export const CLAIMLESS_TESTNET = {
  incidentRegistry: "0xf6B7b759EDcc25AC2D8e941ccbA0A03E401a771D",
  riskScore: "0xC839223ca14BFbe1DA4bC72e885eCe18caCed690",
  agentIdentity: "0x4871Cf94B11A5804F63629A21DFF133C6958eDfa",
  coverPool: "0xA7CDb9c01A329c179da20beE22110082B3CaC0Ae",
  parametricTrigger: "0x12B582FFF71f93dDbfb673189c3C206E9A1c1204",
} as const;

/** Monad testnet USDC (Circle). Re-verify bytecode; testnet resets happen. */
export const MONAD_TESTNET_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;

/** The fixed taxonomy tag Claimless writes into ERC-8004 Reputation. */
export const TAG1_INCIDENT = "claimless:incident" as const;

/**
 * Common failure kinds. `kind` on-chain is bytes32 = keccak256(utf8 string), so
 * these are the strings to hash, not the hashes themselves.
 */
export const INCIDENT_KINDS = [
  "SLA_BREACH",
  "WRONG_OUTPUT",
  "LATENCY",
  "UNAVAILABLE",
  "UNAUTHORIZED_ACTION",
  "DATA_LEAK",
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];
