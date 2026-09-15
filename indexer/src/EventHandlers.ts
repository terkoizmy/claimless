// Claimless event handlers (Envio HyperIndex v3 API, envio@^3.6).
// Entities: Agent, Incident, Challenge, ScoreSnapshot (see schema.graphql).
//
// Event ordering guarantee from IncidentRegistry.resolveChallenge():
//   ChallengeResolved is emitted immediately before IncidentFinalized in the
//   same transaction. Handlers rely on this: ChallengeResolved performs the
//   accepted-count / severity-sum tally (mirroring _tallyAgent), and
//   IncidentFinalized only tallies when the incident was still PENDING
//   (the unchallenged finalize() path), so no double counting occurs.

import { indexer } from "envio";
import type { Agent, Incident, Challenge, ScoreSnapshot } from "envio";

// CHALLENGE_WINDOW = 3 days (IncidentRegistry.CHALLENGE_WINDOW), in seconds.
const CHALLENGE_WINDOW_SECONDS = 3n * 24n * 60n * 60n;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Handler context type.
//
// Envio v3 gives us generated entity types, but not a portable name for the
// handler `context`. We derive it from a handler signature so we never have to
// hand-write the entity store surface. This keeps helpers strongly typed
// without importing from a path that only exists inside the container.
// ---------------------------------------------------------------------------
type HandlerContext = Parameters<
  Parameters<typeof indexer.onEvent>[1]
>[0] extends { context: infer C } ? C : never;

/** Seconds (number) -> BigInt, matching the BigInt timestamp fields. */
function ts(eventBlockTimestamp: number): bigint {
  return BigInt(eventBlockTimestamp);
}

/** Recompute the derived avgSeverity after any tally change. */
function recomputeAvgSeverity(agent: Agent): Agent {
  return {
    ...agent,
    avgSeverity:
      agent.acceptedCount > 0 ? Number(agent.severitySum) / agent.acceptedCount : 0,
  };
}

/** Get or create the Agent entity for an ERC-8004 agent id, bumping lastActiveAt. */
async function touchAgent(
  context: HandlerContext,
  agentId: string,
  eventBlockTimestamp: number
): Promise<Agent> {
  const existing = await context.Agent.get(agentId);
  const base: Agent =
    existing ?? {
      id: agentId,
      firstSeenAt: ts(eventBlockTimestamp),
      lastActiveAt: ts(eventBlockTimestamp),
      incidentCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      severitySum: 0n,
      avgSeverity: 0,
      currentScore: 0n,
    };
  const agent = recomputeAvgSeverity({ ...base, lastActiveAt: ts(eventBlockTimestamp) });
  context.Agent.set(agent);
  return agent;
}

/*
 * IncidentReported(uint256 indexed agentId, uint256 indexed incidentId,
 *                  bytes32 kind, uint8 severity, address indexed reporter)
 */
indexer.onEvent(
  { contract: "IncidentRegistry", event: "IncidentReported", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const incidentId = event.params.incidentId.toString();
    const agentId = event.params.agentId.toString();
    const reportedAt = ts(event.block.timestamp);

    await touchAgent(context, agentId, event.block.timestamp);

    const agent = (await context.Agent.get(agentId))!;
    context.Agent.set(
      recomputeAvgSeverity({
        ...agent,
        incidentCount: agent.incidentCount + 1,
        pendingCount: agent.pendingCount + 1,
      })
    );

    const incident: Incident = {
      id: incidentId,
      // Envio v3 sets relations via the `<field>_id` key (docs: "Set
      // relationships in your handlers by assigning <field>_id").
      agent_id: agentId,
      agentId: event.params.agentId,
      kind: event.params.kind,
      // Solidity uint8 surfaces as bigint in Envio; the schema field is Int,
      // so coerce explicitly or the INSERT fails with
      // "cannot cast type bigint to integer[]".
      severity: Number(event.params.severity),
      // NOTE: the event carries no evidenceHash (it is a reportIncident arg,
      // not an event param), so it cannot be indexed from logs.
      reporter: event.params.reporter,
      // The bond (msg.value) is not an event param. Indexing it would require
      // an effect/transaction read; left 0 for the prototype.
      stake: 0n,
      reportedAt,
      challengeDeadline: reportedAt + CHALLENGE_WINDOW_SECONDS,
      challenger: ZERO_ADDRESS,
      challengeStake: 0n,
      status: "PENDING",
      finalizedAt: undefined,
      txHash: event.transaction.hash,
      blockNumber: BigInt(event.block.number),
    };
    context.Incident.set(incident);
  }
);

/*
 * IncidentChallenged(uint256 indexed incidentId, address indexed challenger)
 */
indexer.onEvent(
  { contract: "IncidentRegistry", event: "IncidentChallenged", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const incidentId = event.params.incidentId.toString();
    const incident = await context.Incident.getOrThrow(incidentId);

    context.Incident.set({
      ...incident,
      status: "CHALLENGED",
      challenger: event.params.challenger,
      // Same limitation as stake: the bond amount is not in the event.
      challengeStake: 0n,
    });

    const challenge: Challenge = {
      id: incidentId, // one active challenge per incident
      incident_id: incidentId,
      incidentId: event.params.incidentId,
      challenger: event.params.challenger,
      challengeStake: 0n,
      resolved: false,
      reportStands: undefined,
      winner: undefined,
      resolvedAt: undefined,
    };
    context.Challenge.set(challenge);

    await touchAgent(context, incident.agentId.toString(), event.block.timestamp);
  }
);

/*
 * ChallengeResolved(uint256 indexed incidentId, bool reportStands, address winner)
 * Mirrors IncidentRegistry._tallyAgent: only a report that stands counts.
 */
indexer.onEvent(
  { contract: "IncidentRegistry", event: "ChallengeResolved", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const incidentId = event.params.incidentId.toString();
    const incident = await context.Incident.getOrThrow(incidentId);
    const challenge = await context.Challenge.getOrThrow(incidentId);
    const agentId = incident.agentId.toString();

    const stands = event.params.reportStands;

    context.Incident.set({
      ...incident,
      status: stands ? "ACCEPTED" : "REJECTED",
    });

    context.Challenge.set({
      ...challenge,
      resolved: true,
      reportStands: stands,
      winner: event.params.winner,
      resolvedAt: ts(event.block.timestamp),
    });

    await touchAgent(context, agentId, event.block.timestamp);

    const agent = (await context.Agent.get(agentId))!;
    if (stands) {
      context.Agent.set(
        recomputeAvgSeverity({
          ...agent,
          acceptedCount: agent.acceptedCount + 1,
          pendingCount: agent.pendingCount - 1,
          severitySum: agent.severitySum + BigInt(incident.severity),
        })
      );
    } else {
      context.Agent.set(
        recomputeAvgSeverity({
          ...agent,
          rejectedCount: agent.rejectedCount + 1,
          pendingCount: agent.pendingCount - 1,
        })
      );
    }
  }
);

/*
 * IncidentFinalized(uint256 indexed incidentId, bool accepted)
 * Two paths reach here:
 *  - finalize(): unopposed report past the challenge window (status PENDING).
 *  - resolveChallenge(): ChallengeResolved already fired in the same tx and
 *    already did the tally; here we only stamp status + finalizedAt.
 */
indexer.onEvent(
  { contract: "IncidentRegistry", event: "IncidentFinalized", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const incidentId = event.params.incidentId.toString();
    const incident = await context.Incident.getOrThrow(incidentId);
    const accepted = event.params.accepted;

    context.Incident.set({
      ...incident,
      status: accepted ? "ACCEPTED" : "REJECTED",
      finalizedAt: ts(event.block.timestamp),
    });

    await touchAgent(context, incident.agentId.toString(), event.block.timestamp);

    // Tally only on the unchallenged finalize() path (status was PENDING).
    if (accepted && incident.status === "PENDING") {
      const agent = (await context.Agent.get(incident.agentId.toString()))!;
      context.Agent.set(
        recomputeAvgSeverity({
          ...agent,
          acceptedCount: agent.acceptedCount + 1,
          pendingCount: agent.pendingCount - 1,
          severitySum: agent.severitySum + BigInt(incident.severity),
        })
      );
    }
  }
);

/*
 * ScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore)
 */
indexer.onEvent(
  { contract: "RiskScore", event: "ScoreUpdated", fields: { transaction: ["hash"], block: ["timestamp"] } },
  async ({ event, context }) => {
    const agentId = event.params.agentId.toString();

    await touchAgent(context, agentId, event.block.timestamp);
    const agent = (await context.Agent.get(agentId))!;
    context.Agent.set({ ...agent, currentScore: event.params.newScore });

    const snapshot: ScoreSnapshot = {
      id: `${agentId}-${event.logIndex}-${event.block.number}`,
      agent_id: agentId,
      agentId: event.params.agentId,
      oldScore: event.params.oldScore,
      newScore: event.params.newScore,
      timestamp: ts(event.block.timestamp),
      blockNumber: BigInt(event.block.number),
    };
    context.ScoreSnapshot.set(snapshot);
  }
);
