/**
 * Minimal viem ABIs for the deployed Claimless contracts, declared as
 * human-readable signatures copied verbatim from contracts/src/*.sol and
 * parsed with viem's parseAbi (required: raw strings do not work at runtime).
 *
 * These are read-only surfaces: no write function is included, deliberately.
 */

import { parseAbi } from "viem";

export const incidentRegistryAbi = parseAbi([
  "function getAcceptedCount(uint256 agentId) view returns (uint256)",
  "function getAcceptedSeveritySum(uint256 agentId) view returns (uint256)",
  "function getIncidentCount(uint256 agentId) view returns (uint256)",
  "function totalIncidents() view returns (uint256)",
  "function minStake() view returns (uint256)",
  // Incident struct: (id, agentId, kind, severity, evidenceHash, reporter,
  //                   stake, reportedAt, challengeDeadline, challenger,
  //                   challengeStake, status)  -- field order from
  //                   contracts/src/interfaces/ClaimlessTypes.sol
  "function getIncident(uint256 incidentId) view returns ((uint256,uint256,bytes32,uint8,bytes32,address,uint256,uint40,uint40,address,uint256,uint8))",
]);

export const riskScoreAbi = parseAbi([
  "function getScore(uint256 agentId) view returns (uint256)",
  "function getScoreBundle(uint256 agentId) view returns (uint256 score, uint256 acceptedCount, uint256 severitySum)",
  "function getStoredScore(uint256 agentId) view returns (uint256)",
  "function hasScore(uint256 agentId) view returns (bool)",
]);

export const coverPoolAbi = parseAbi([
  "function quotePremium(uint256 agentId, uint256 amount, uint256 duration) view returns (uint256 premium, uint256 maxCoverage, bool hadRecord, uint256 riskMultiplier)",
  "function totalCapital() view returns (uint256)",
  "function lockedCapital() view returns (uint256)",
  "function premiumsCollected() view returns (uint256)",
  "function policyCount() view returns (uint256)",
  "function getCapacity() view returns (uint256)",
  "function coverageOf(uint256 agentId) view returns (uint256)",
  "function multiplierForScore(uint256 score) view returns (uint256)",
  "function NO_RECORD_MULTIPLIER() view returns (uint256)",
  "function NO_RECORD_MAX_BPS() view returns (uint256)",
  "function NORMAL_MAX_CAPACITY_BPS() view returns (uint256)",
  "function BASE_RATE_BPS() view returns (uint256)",
]);

export const parametricTriggerAbi = parseAbi([
  "function forwarder() view returns (address)",
  "function triggerCount() view returns (uint256)",
  "function registeredPolicies() view returns (uint256[])",
]);

/** Canonical ERC-8004 IdentityRegistry (external, we only read from it here). */
export const erc8004IdentityAbi = parseAbi([
  "function ownerOf(uint256 agentId) view returns (address)",
  // So viem can decode the revert for an unregistered id instead of throwing
  // a raw selector (selector 0x7e273289 = ERC721NonexistentToken, verified via 4byte).
  "error ERC721NonexistentToken(uint256 tokenId)",
]);