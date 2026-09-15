/**
 * Envio indexer (Hasura GraphQL) client for Claimless.
 *
 * The indexer runs locally in Docker (`indexer/docker-compose.yaml`) and serves
 * Hasura at http://localhost:8081/v1/graphql with admin secret `testing`.
 *
 * Everything here is plain fetch against the GraphQL endpoint — no codegen
 * dependency. Queries are written out in full below so the exact documents are
 * reviewable, and results are cast to the SDK's `Indexed*` types.
 *
 * Schema source of truth: `indexer/schema.graphql`
 * (entities: Agent, Incident, Challenge, ScoreSnapshot).
 *
 * Verified against the live Hasura instance (Envio multi-chain mode):
 *  - `_by_pk` root fields require a `chainId` arg (Monad testnet = 10143) and
 *    an `id: String!` variable (Hasura maps Envio's `ID` entity key to String).
 *  - `where` filters on entity `id` use `String` (not `ID!`), and filters on
 *    denormalized `agentId` / `incidentId` columns use `numeric`.
 *  - `order_by` IS accepted on plain entity fields and on denormalized
 *    bigint/numeric columns (e.g. `order_by: { reportedAt: desc }`), but
 *    sorting is also applied in JS as a safety net (see `sortByDesc`),
 *    since per-column orderability is not guaranteed.
 */

import { readEnv, type ClaimlessEnv } from "./env.js";
import type {
  IndexedAgent,
  IndexedChallenge,
  IndexedIncident,
  IndexedScoreSnapshot,
} from "./types.js";

/** Monad testnet chain id, used for `_by_pk(chainId:)` lookups. */
export const INDEXER_CHAIN_ID = 10143 as const;

// ---------------------------------------------------------------------------
// GraphQL documents
// ---------------------------------------------------------------------------

/** All Agent columns (derived aggregates included; incidents/scores excluded). */
const AGENT_FIELDS = `
  id
  firstSeenAt
  lastActiveAt
  incidentCount
  acceptedCount
  rejectedCount
  pendingCount
  severitySum
  avgSeverity
  currentScore
`;

/** All Incident columns. */
const INCIDENT_FIELDS = `
  id
  agentId
  kind
  severity
  reporter
  stake
  reportedAt
  challengeDeadline
  challenger
  challengeStake
  status
  finalizedAt
  txHash
  blockNumber
`;

/** All Challenge columns. */
const CHALLENGE_FIELDS = `
  id
  incidentId
  challenger
  challengeStake
  resolved
  reportStands
  winner
  resolvedAt
`;

/** All ScoreSnapshot columns. */
const SCORE_FIELDS = `
  id
  agentId
  oldScore
  newScore
  timestamp
  blockNumber
`;

const QUERY_AGENT_BY_PK = /* GraphQL */ `
  query GetAgent($id: String!, $chainId: Int!) {
    Agent_by_pk(id: $id, chainId: $chainId) {
${AGENT_FIELDS}
    }
  }
`;

const QUERY_AGENTS = /* GraphQL */ `
  query GetAgents($limit: Int) {
    Agent(order_by: { firstSeenAt: asc }, limit: $limit) {
${AGENT_FIELDS}
    }
  }
`;

const QUERY_INCIDENTS_ALL = /* GraphQL */ `
  query GetIncidents($limit: Int) {
    Incident(order_by: { reportedAt: desc }, limit: $limit) {
${INCIDENT_FIELDS}
    }
  }
`;

const QUERY_INCIDENTS_BY_AGENT = /* GraphQL */ `
  query GetIncidentsByAgent($agentId: numeric!, $limit: Int) {
    Incident(
      where: { agentId: { _eq: $agentId } }
      order_by: { reportedAt: desc }
      limit: $limit
    ) {
${INCIDENT_FIELDS}
    }
  }
`;

const QUERY_INCIDENT_BY_PK = /* GraphQL */ `
  query GetIncident($id: String!, $chainId: Int!) {
    Incident_by_pk(id: $id, chainId: $chainId) {
${INCIDENT_FIELDS}
    }
  }
`;

const QUERY_CHALLENGES_ALL = /* GraphQL */ `
  query GetChallenges {
    Challenge(order_by: { resolvedAt: desc }) {
${CHALLENGE_FIELDS}
    }
  }
`;

const QUERY_CHALLENGES_BY_INCIDENT = /* GraphQL */ `
  query GetChallengesByIncident($incidentId: numeric!) {
    Challenge(
      where: { incidentId: { _eq: $incidentId } }
      order_by: { resolvedAt: desc }
    ) {
${CHALLENGE_FIELDS}
    }
  }
`;

const QUERY_SCORE_HISTORY = /* GraphQL */ `
  query GetScoreHistory($agentId: numeric!, $limit: Int) {
    ScoreSnapshot(
      where: { agentId: { _eq: $agentId } }
      order_by: { timestamp: desc }
      limit: $limit
    ) {
${SCORE_FIELDS}
    }
  }
`;

/**
 * One round trip for getAgentSummary: the agent row, its incidents, and its
 * recent score history (Agent.incidents / Agent.scores derived fields).
 */
const QUERY_AGENT_SUMMARY = /* GraphQL */ `
  query GetAgentSummary($id: String!, $chainId: Int!, $limit: Int) {
    Agent_by_pk(id: $id, chainId: $chainId) {
${AGENT_FIELDS}
      incidents(order_by: { reportedAt: desc }) {
${INCIDENT_FIELDS}
      }
      scores(order_by: { timestamp: desc }, limit: $limit) {
${SCORE_FIELDS}
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface GetAgentsOpts {
  limit?: number;
}

export interface GetIncidentsOpts {
  limit?: number;
}

export interface GetScoresOpts {
  limit?: number;
}

export interface AgentSummary {
  agent: IndexedAgent | null;
  incidents: IndexedIncident[];
  recentScores: IndexedScoreSnapshot[];
}

/**
 * Read-only client for the Claimless Envio indexer (Hasura GraphQL).
 */
export interface EnvioClient {
  /** The GraphQL endpoint in use (surfaced in demos/logs). */
  readonly graphqlUrl: string;
  /** Fetch one agent by ERC-8004 id (stringified uint256), or null. */
  getAgent(agentId: string): Promise<IndexedAgent | null>;
  /** List agents (oldest first). */
  getAgents(opts?: GetAgentsOpts): Promise<IndexedAgent[]>;
  /** List incidents, newest first, optionally filtered to one agent. */
  getIncidents(agentId?: string, opts?: GetIncidentsOpts): Promise<IndexedIncident[]>;
  /** Fetch one incident by global id (stringified uint256), or null. */
  getIncident(incidentId: string): Promise<IndexedIncident | null>;
  /** List challenges, optionally filtered to one incident. */
  getChallenges(incidentId?: string): Promise<IndexedChallenge[]>;
  /** Score history for one agent, newest first. */
  getScoreHistory(agentId: string, opts?: GetScoresOpts): Promise<IndexedScoreSnapshot[]>;
  /** Agent + its incidents + recent score history in one query. */
  getAgentSummary(agentId: string): Promise<AgentSummary>;
}

const DEFAULT_LIMIT = 50;

/**
 * Build an EnvioClient. Fails only when a call is actually made and the
 * indexer is unreachable — readEnv supplies sensible localhost defaults.
 */
export function createEnvioClient(env: ClaimlessEnv = readEnv()): EnvioClient {
  const { graphqlUrl, hasuraSecret } = env;

  /**
   * POST one GraphQL document. Throws a clear, actionable error when the
   * indexer is down, and surfaces the Hasura `errors` array when present.
   */
  async function query<T>(
    gql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": hasuraSecret,
        },
        body: JSON.stringify({ query: gql, variables: variables ?? {} }),
      });
    } catch (cause) {
      throw new Error(
        `Cannot reach the Claimless indexer at ${graphqlUrl} (${(cause as Error).message}). ` +
          "Start it with: docker compose -f indexer/docker-compose.yaml up -d",
        { cause },
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Indexer at ${graphqlUrl} returned HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}. ` +
          "If it is not running, start it with: docker compose -f indexer/docker-compose.yaml up -d",
      );
    }

    type HasuraResponse<T> = { data?: T; errors?: Array<{ message: string }> };
    let body: HasuraResponse<T>;
    try {
      body = (await res.json()) as HasuraResponse<T>;
    } catch (cause) {
      throw new Error(
        `Indexer at ${graphqlUrl} returned invalid JSON (${(cause as Error).message}).`,
        { cause },
      );
    }

    if (body.errors?.length) {
      throw new Error(
        `GraphQL error from indexer: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!body.data) {
      throw new Error("Indexer response contained neither 'data' nor 'errors'.");
    }
    return body.data;
  }

  /**
   * Generic descending sort by a numeric-ish field, applied in JS after
   * fetching. `order_by` is sent in the document too, but this guards the
   * case where Hasura rejects/ignores it for a given column.
   */
  function sortByDesc<T>(rows: T[], field: keyof T): T[] {
    return [...rows].sort((a, b) => {
      const av = Number(a[field]);
      const bv = Number(b[field]);
      const an = Number.isFinite(av) ? av : 0;
      const bn = Number.isFinite(bv) ? bv : 0;
      return bn - an;
    });
  }

  const client: EnvioClient = {
    graphqlUrl,

    async getAgent(agentId) {
      const data = await query<{ Agent_by_pk: IndexedAgent | null }>(
        QUERY_AGENT_BY_PK,
        { id: agentId, chainId: INDEXER_CHAIN_ID },
      );
      return data.Agent_by_pk;
    },

    async getAgents(opts) {
      const data = await query<{ Agent: IndexedAgent[] }>(QUERY_AGENTS, {
        limit: opts?.limit ?? DEFAULT_LIMIT,
      });
      return data.Agent ?? [];
    },

    async getIncidents(agentId, opts) {
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      const data = agentId
        ? await query<{ Incident: IndexedIncident[] }>(QUERY_INCIDENTS_BY_AGENT, {
            agentId,
            limit,
          })
        : await query<{ Incident: IndexedIncident[] }>(QUERY_INCIDENTS_ALL, { limit });
      // Sort in JS: agentId/reportedAt ordering is not guaranteed across
      // Hasura versions; numeric-string fields sort correctly here.
      return sortByDesc(data.Incident ?? [], "reportedAt");
    },

    async getIncident(incidentId) {
      const data = await query<{ Incident_by_pk: IndexedIncident | null }>(
        QUERY_INCIDENT_BY_PK,
        { id: incidentId, chainId: INDEXER_CHAIN_ID },
      );
      return data.Incident_by_pk;
    },

    async getChallenges(incidentId) {
      const data = incidentId
        ? await query<{ Challenge: IndexedChallenge[] }>(QUERY_CHALLENGES_BY_INCIDENT, {
            incidentId,
          })
        : await query<{ Challenge: IndexedChallenge[] }>(QUERY_CHALLENGES_ALL);
      return sortByDesc(data.Challenge ?? [], "resolvedAt");
    },

    async getScoreHistory(agentId, opts) {
      const data = await query<{ ScoreSnapshot: IndexedScoreSnapshot[] }>(
        QUERY_SCORE_HISTORY,
        { agentId, limit: opts?.limit ?? DEFAULT_LIMIT },
      );
      return sortByDesc(data.ScoreSnapshot ?? [], "timestamp");
    },

    async getAgentSummary(agentId) {
      const data = await query<{
        Agent_by_pk:
          | (IndexedAgent & {
              incidents: IndexedIncident[];
              scores: IndexedScoreSnapshot[];
            })
          | null;
      }>(QUERY_AGENT_SUMMARY, { id: agentId, chainId: INDEXER_CHAIN_ID, limit: DEFAULT_LIMIT });

      const row = data.Agent_by_pk;
      return {
        agent: row,
        incidents: row ? sortByDesc(row.incidents, "reportedAt") : [],
        recentScores: row ? sortByDesc(row.scores, "timestamp") : [],
      };
    },
  };

  return client;
}