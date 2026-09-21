/**
 * Minimal ABI fragments for the Claimless MCP server.
 *
 * Only the functions the 4 tools actually call. Shapes mirror
 * sdk/src/abis/*.json, which mirror the deployed contracts:
 *   - IncidentRegistry (contracts/src/IncidentRegistry.sol)
 *   - RiskScore        (contracts/src/RiskScore.sol)
 *   - ERC-8004 IdentityRegistry (canonical, deterministic address)
 *
 * On-chain IncidentStatus enum (verified against ClaimlessTypes.sol):
 *   0 PENDING, 1 ACCEPTED, 2 REJECTED, 3 CHALLENGED
 */

import type { Abi } from "viem";

export const INCIDENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getIncidents",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "id", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "kind", type: "bytes32" },
          { name: "severity", type: "uint8" },
          { name: "evidenceHash", type: "bytes32" },
          { name: "reporter", type: "address" },
          { name: "stake", type: "uint256" },
          { name: "reportedAt", type: "uint40" },
          { name: "challengeDeadline", type: "uint40" },
          { name: "challenger", type: "address" },
          { name: "challengeStake", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getIncidentCount",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAcceptedCount",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAcceptedSeveritySum",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalIncidents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "CHALLENGE_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "reportIncident",
    stateMutability: "payable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "kind", type: "bytes32" },
      { name: "severity", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [{ name: "incidentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "IncidentReported",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "incidentId", type: "uint256", indexed: true },
      { name: "kind", type: "bytes32", indexed: false },
      { name: "severity", type: "uint8", indexed: false },
      { name: "reporter", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi;

export const RISK_SCORE_ABI = [
  {
    type: "function",
    name: "getScoreBundle",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "score", type: "uint256" },
      { name: "acceptedCount", type: "uint256" },
      { name: "severitySum", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getStoredScore",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasScore",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "FREQ_WEIGHT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "SEV_WEIGHT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_SCORE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export const ERC8004_IDENTITY_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

export const ERC8004_REPUTATION_ABI = [
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clients", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const satisfies Abi;

/** On-chain IncidentStatus enum order, verified against ClaimlessTypes.sol. */
export const STATUS_BY_INDEX = ["PENDING", "ACCEPTED", "REJECTED", "CHALLENGED"] as const;

export type IncidentStatus = (typeof STATUS_BY_INDEX)[number];

export function statusFromIndex(index: number | bigint): IncidentStatus {
  const status = STATUS_BY_INDEX[Number(index)];
  if (status === undefined) {
    throw new Error(`Unknown IncidentStatus enum index ${index} from IncidentRegistry`);
  }
  return status;
}