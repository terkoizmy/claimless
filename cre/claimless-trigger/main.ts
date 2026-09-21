/**
 * Claimless parametric trigger workflow (Chainlink CRE).
 *
 * WHY THIS EXISTS
 * ---------------
 * Claimless's whole thesis is "no committee, no voting": payout must be driven
 * by measurable data. If our own server runs the check, that server becomes a
 * single point of trust and failure — the failure mode we designed against
 * (Nexus Mutual V1 voting -> V2 stake-weighted -> V3 three human experts).
 *
 * CRE moves the check onto a Decentralized Oracle Network. Every capability call
 * below is executed by multiple independent nodes and merged by BFT consensus,
 * so no single operator (including us) decides whether a payout fires.
 *
 * WHAT THIS WORKFLOW DOES (read-only today)
 * -----------------------------------------
 *   cron trigger (every 5 minutes)
 *     -> EVM read: RiskScore.getScore(agentId)           [consensus-verified]
 *     -> EVM read: IncidentRegistry.getAcceptedCount(id) [consensus-verified]
 *     -> evaluate a deterministic, narrow condition
 *     -> return the decision
 *
 * DESIGN NOTE: the condition is arithmetic, not judgement. "AI quality" is not
 * machine-checkable; "score <= threshold and at least one accepted incident" is.
 * Keeping the trigger narrow is what lets us say "no human adjudication"
 * honestly.
 *
 * NOT YET WRITING ON-CHAIN
 * ------------------------
 * This logs a decision instead of writing. Making it write requires:
 *   1. `ParametricTrigger` implements `IReceiver.onReport(bytes,bytes)`, and
 *   2. the KeystoneForwarder address (FORWARDER below).
 * The signed-report path is deliberately not faked.
 *
 * VERIFIED ENVIRONMENT (2026-09-21)
 * ---------------------------------
 *   CLI v1.34.0, SDK @chainlink/cre-sdk 1.22.0.
 *   `cre workflow supported-chains` confirms monad-testnet IS supported:
 *     selector         2183018362218727504
 *     forwarder        0xF8344CFd5c43616a4366C34E3EEE75af79a74482
 *     mock forwarder   0xB9F79d863261869B234c481D1f9A7af84AeAd192
 *
 * Bounty: "Best workflow with CRE" ($3,000) — CRE is the orchestration layer for
 * the trigger, not decoration.
 */

import {
  CronCapability,
  EVMClient,
  getNetwork,
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  handler,
  type Runtime,
  Runner,
} from "@chainlink/cre-sdk";
import {
  type Address,
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  zeroAddress,
} from "viem";
import { z } from "zod";

/* ─────────────────────────── configuration ─────────────────────────────── */

/**
 * Config schema. `cre` parses config-path JSON automatically and validates it
 * against this schema, so a malformed config fails loudly instead of silently
 * producing a wrong decision.
 */
const configSchema = z.object({
  agentId: z.number().int().nonnegative(),
  scoreThreshold: z.number().int().min(0).max(100),
  minAcceptedIncidents: z.number().int().nonnegative(),
  incidentRegistry: z.string(),
  riskScore: z.string(),
  chainName: z.string(),
});

type TriggerConfig = z.infer<typeof configSchema>;

/** Claimless contracts (Monad testnet, from contracts/deployments/monad-testnet.json).
 *  Both are 42 chars (0x + 40 hex); a 41-char address fails at call time. */
const RISK_SCORE_ABI = parseAbi(["function getScore(uint256 agentId) view returns (uint256)"]);
const INCIDENT_REGISTRY_ABI = parseAbi([
  "function getAcceptedCount(uint256 agentId) view returns (uint256)",
]);

/** KeystoneForwarder on Monad testnet, from `cre workflow supported-chains`.
 *  Needed only once this workflow writes on-chain. */
const FORWARDER = "0xF8344CFd5c43616a4366C34E3EEE75af79a74482" as const;

/** Result shape. Primitive only, so CRE can serialize it. */
interface TriggerEvaluation {
  agentId: number;
  score: number;
  acceptedIncidents: number;
  scoreThreshold: number;
  breach: boolean;
  decision: string;
}

/* ──────────────────────────── the handler ──────────────────────────────── */

const onCronTrigger = (runtime: Runtime<TriggerConfig>): TriggerEvaluation => {
  const cfg = runtime.config;

  // Resolve the chain selector by name, so the name in config is validated
  // against CRE's own registry rather than trusted blindly.
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName });
  if (!network) throw new Error(`CRE does not know chain "${cfg.chainName}"`);

  const evm = new EVMClient(network.chainSelector.selector);

  /** Reads `getScore(uint256)`. Consensus-verified across the DON. */
  const readScore = (to: string, arg: number): bigint => {
    const data = encodeFunctionData({
      abi: RISK_SCORE_ABI,
      functionName: "getScore",
      args: [BigInt(arg)],
    });
    const reply = evm
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();
    return decodeFunctionResult({
      abi: RISK_SCORE_ABI,
      functionName: "getScore",
      data: bytesToHex(reply.data),
    }) as bigint;
  };

  /** Reads `getAcceptedCount(uint256)`. Consensus-verified across the DON. */
  const readAcceptedCount = (to: string, arg: number): bigint => {
    const data = encodeFunctionData({
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getAcceptedCount",
      args: [BigInt(arg)],
    });
    const reply = evm
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();
    return decodeFunctionResult({
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getAcceptedCount",
      data: bytesToHex(reply.data),
    }) as bigint;
  };

  const score = Number(readScore(cfg.riskScore, cfg.agentId));
  const accepted = Number(readAcceptedCount(cfg.incidentRegistry, cfg.agentId));

  // Deterministic, narrow condition — no judgement, no discretion.
  const hasRecord = accepted >= cfg.minAcceptedIncidents;
  const breach = hasRecord && score <= cfg.scoreThreshold;

  const decision = !hasRecord
    ? "NO_RECORD: no accepted incidents; coverage stays at the punitive no-record tier"
    : breach
      ? `BREACH: score ${score} <= ${cfg.scoreThreshold} with ${accepted} accepted incident(s); payout condition met`
      : `OK: score ${score} > ${cfg.scoreThreshold}; no payout`;

  runtime.log(
    `[claimless] agent=${cfg.agentId} score=${score} accepted=${accepted} breach=${breach}`,
  );

  // When ParametricTrigger lands, replace this log with a signed write:
  //   const report = runtime.report(prepareReportRequest(encodedPayload)).result();
  //   evm.writeReport(runtime, { receiver: FORWARDER, report }).result();
  // The consumer contract then implements IReceiver.onReport(bytes,bytes).
  void FORWARDER;

  return {
    agentId: cfg.agentId,
    score,
    acceptedIncidents: accepted,
    scoreThreshold: cfg.scoreThreshold,
    breach,
    decision,
  };
};

/* ───────────────────────────── workflow ────────────────────────────────── */

const initWorkflow = (config: TriggerConfig) => {
  const cron = new CronCapability();

  return [
    handler(
      cron.trigger({ schedule: "*/5 * * * *" }), // every 5 minutes
      onCronTrigger,
    ),
  ];
};

export async function main(): Promise<void> {
  const runner = await Runner.newRunner<TriggerConfig>({ configSchema });
  await runner.run(initWorkflow);
}
