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
 * Verify live with: `cast code <address> --rpc-url https://testnet-rpc.monad.xyz`
 */
export const CLAIMLESS_TESTNET = {
  incidentRegistry: "0xF856AC417597eb1aD952CEeb963FD51B1D2789cF",
  riskScore: "0xF61B247543D0719c74D222057E3dd49F863f87f9",
  agentIdentity: "0x7eFC535445E323fC50BF652D3fc42332057Ae703",
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
