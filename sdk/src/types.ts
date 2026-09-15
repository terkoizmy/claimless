/**
 * Shared SDK types. Keep these aligned with:
 *  - contracts/src/interfaces/ClaimlessTypes.sol
 *  - indexer/schema.graphql
 */

/** Lifecycle of a report under the optimistic dispute model. */
export type IncidentStatus = "PENDING" | "CHALLENGED" | "ACCEPTED" | "REJECTED";

/** An incident as stored on chain (IncidentRegistry.getIncident). */
export interface OnChainIncident {
  id: bigint;
  agentId: bigint;
  kind: `0x${string}`;
  severity: number;
  evidenceHash: `0x${string}`;
  reporter: `0x${string}`;
  stake: bigint;
  reportedAt: number;
  challengeDeadline: number;
  challenger: `0x${string}`;
  challengeStake: bigint;
  status: IncidentStatus;
}

/** An agent aggregate as served by the Envio indexer. */
export interface IndexedAgent {
  id: string;
  firstSeenAt: string;
  lastActiveAt: string;
  incidentCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  severitySum: string;
  avgSeverity: number;
  currentScore: string;
}

/** An incident as served by the Envio indexer. */
export interface IndexedIncident {
  id: string;
  agentId: string;
  kind: string;
  severity: number;
  reporter: string;
  stake: string;
  reportedAt: string;
  challengeDeadline: string;
  challenger: string | null;
  challengeStake: string;
  status: IncidentStatus;
  finalizedAt: string | null;
  txHash: string;
  blockNumber: string;
}

export interface IndexedChallenge {
  id: string;
  challengeStake: string;
  challenger: string;
  resolved: boolean;
  reportStands: boolean | null;
  winner: string | null;
  resolvedAt: string | null;
}

export interface IndexedScoreSnapshot {
  id: string;
  agentId: string;
  oldScore: string;
  newScore: string;
  timestamp: string;
  blockNumber: string;
}

/** A risk score read from either source. */
export interface RiskScore {
  agentId: bigint;
  /** 0-100, where 100 is safest. */
  score: number;
  acceptedCount: number;
  severitySum: number;
  /** Which path produced this reading. */
  source: "contract" | "indexer";
}

/** ERC-8004 identity lookups. */
export interface AgentIdentityInfo {
  agentId: bigint;
  owner: `0x${string}`;
  agentWallet: `0x${string}`;
  tokenURI: string;
}

/** ERC-8004 reputation summary. */
export interface AgentReputation {
  agentId: bigint;
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
}
