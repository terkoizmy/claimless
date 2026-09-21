/**
 * Minimal hand-written ABIs. Only the functions this plugin actually calls.
 * Mirrors contracts/src/{RiskScore,IncidentRegistry,AgentIdentity}.sol and the
 * canonical ERC-8004 registries. Kept inline so the plugin ships no extra
 * build steps and cannot drift from the calls it makes.
 */

import type { Abi } from "viem";

/** Read surface of contracts/src/RiskScore.sol. */
export const RISK_SCORE_ABI = [
  {
    type: "function",
    name: "getScore",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getScoreBundle",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "score", type: "uint256" },
      { name: "acceptedCount", type: "uint256" },
      { name: "severitySum", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** Read + write surface of contracts/src/IncidentRegistry.sol used here. */
export const INCIDENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getAcceptedCount",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAcceptedSeveritySum",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getIncidentCount",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minStake",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reportIncident",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "kind", type: "bytes32" },
      { name: "severity", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [{ name: "incidentId", type: "uint256" }],
    stateMutability: "payable",
  },
] as const satisfies Abi;

/** Read surface of contracts/src/AgentIdentity.sol. */
export const AGENT_IDENTITY_ABI = [
  {
    type: "function",
    name: "getAgentOwner",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentWallet",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentRisk",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** Canonical ERC-8004 IdentityRegistry (upstream, deterministic deployment). */
export const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentWallet",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** Canonical ERC-8004 ReputationRegistry (upstream, deterministic deployment). */
export const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "getSummary",
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
    stateMutability: "view",
  },
] as const satisfies Abi;