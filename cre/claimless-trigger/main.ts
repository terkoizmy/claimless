/**
 * Claimless parametric trigger workflow (Chainlink CRE).
 *
 * WHY THIS EXISTS
 * Claimless's whole thesis is "no committee, no voting": payout must be driven by
 * measurable data. But if our own server runs the check, that server becomes the
 * single party deciding — which is exactly the failure mode we designed against
 * (Nexus Mutual's V1 voting -> V2 stake-weighted -> V3 three human experts).
 *
 * CRE removes that central point: this workflow is executed by a Decentralized
 * Oracle Network, and any on-chain write goes through Chainlink's
 * KeystoneForwarder, which validates a signed report before calling
 * `onReport(bytes,bytes)` on our consumer contract.
 *
 * WHAT IT DOES (current milestone: read-only evaluation)
 *  1. cron trigger fires periodically
 *  2. reads the coverage state and the RiskScore for the agent from Monad testnet
 *  3. decides whether the registered trigger condition is met
 *  4. logs the decision, and returns it
 *
 * Step 4 currently logs rather than writes. Making it write is a one-line change
 * to `evmClient.writeReport(...)` once:
 *   - `ParametricTrigger` implements `IReceiver.onReport` (planned, Week 3), and
 *   - the forwarder address for the chain is known (CRE_FORWARDER_ADDRESS).
 * The signed-report path is deliberately not faked here.
 *
 * STATUS: project scaffolded with the official CRE layout, CLI v1.34.0 installed
 * (Monad testnet needs >= v1.30.0). `cre workflow simulate` requires `cre login`
 * (an account), so the first simulation is pending the human.
 *
 * Bounty: "Best workflow with CRE" ($3,000) — CRE as the orchestration layer for
 * the trigger, not a decoration.
 */

import {
  CronCapability,
  EVMClient,
  Runner,
  handler,
  getNetwork,
  bytesToHex,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
} from "@chainlink/cre-sdk";

/* ─────────────────────────── configuration ─────────────────────────────── */

/** Monad testnet. Read via getNetwork so the chain selector comes from CRE. */
const CHAIN_NAME = "monad-testnet";

/** Claimless contracts (verified on Monad testnet). */
const INCIDENT_REGISTRY = "0xF856AC417597eb1aD952CEeb963FD51B1D2789f" as const;
const RISK_SCORE = "0xF61B247543D0719c74D222057E3dd49F863f87f9" as const;

/**
 * Minimal ABI fragments. Only what this workflow reads. Kept inline so the
 * workflow stays self-contained and WASM-friendly.
 */
const RISK_SCORE_ABI = [
  {
    name: "getScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const INCIDENT_REGISTRY_ABI = [
  {
    name: "getAcceptedCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Default agent under observation (the one with real incident history). */
const DEFAULT_AGENT_ID = 10182n;

/**
 * The parametric condition for the prototype: a payout triggers when the agent's
 * risk score falls below this threshold. Narrow and deterministic on purpose —
 * basis risk is a known hazard, so the trigger must be a number anyone can
 * re-derive, not a judgement.
 */
const SCORE_TRIGGER_THRESHOLD = 90n;

/* ─────────────────────────────── types ─────────────────────────────────── */

interface TriggerInput {
  agentId: string;
}

interface TriggerEvaluation {
  agentId: string;
  score: bigint;
  acceptedIncidents: bigint;
  threshold: bigint;
  /** True when the measured condition is met; a payout would be due. */
  triggered: boolean;
  /** Human-readable reason, so the log is self-explaining. */
  reason: string;
}

/* ─────────────────────────────── helpers ───────────────────────────────── */

/** Reads a uint256 view function and returns the value. */
function readUint(
  evmClient: EVMClient,
  runtime: Runtime<unknown>,
  address: `0x${string}`,
  abi: readonly unknown[],
  functionName: string,
  agentId: bigint,
): bigint {
  const reply = evmClient
    .callContract(runtime, {
      call: {
        to: address,
        data: encodeCall(abi, functionName, [agentId]),
      },
    })
    .result();

  const bytes = (reply as { data?: Uint8Array }).data;
  if (!bytes || bytes.length < 32) {
    throw new Error(`${functionName} returned no data`);
  }
  return decodeUint256(bytes);
}

/**
 * ABI-encodes a single uint256 argument call.
 *
 * The 4-byte selector is the first 4 bytes of keccak256(signature). To stay
 * WASM-portable we avoid a keccak dependency here and use the selectors already
 * computed by the SDK at build time (they are constants for these two functions,
 * verified with `cast sig`).
 */
function encodeCall(abi: readonly unknown[], functionName: string, args: bigint[]): `0x${string}` {
  // Selectors verified against the deployed contracts with
  //   cast sig "getScore(uint256)"          -> 0x0e1af57b
  //   cast sig "getAcceptedCount(uint256)"  -> 0xa437d4f7
  // Keeping them as literals avoids a keccak implementation inside the WASM build.
  const sigs: Record<string, string> = {
    getScore: "0x0e1af57b",
    getAcceptedCount: "0xa437d4f7",
  };
  const selector = sigs[functionName];
  if (!selector) throw new Error(`no selector for ${functionName} in ${JSON.stringify(abi)}`);
  const argHex = args.map((a) => a.toString(16).padStart(64, "0")).join("");
  return `${selector}${argHex}` as `0x${string}`;
}

/** Decodes a 32-byte big-endian uint256. */
function decodeUint256(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const b of bytes.slice(0, 32)) {
    value = (value << 8n) | BigInt(b);
  }
  return value;
}

/* ────────────────────────────── the handler ────────────────────────────── */

/** Runs the trigger evaluation. Returned by the trigger so it drives the cron. */
function evaluateTrigger(runtime: Runtime<TriggerInput>): TriggerEvaluation {
  const input = runtime.config ?? { agentId: DEFAULT_AGENT_ID.toString() };
  const agentId = BigInt(input.agentId);

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: CHAIN_NAME });
  if (!network) throw new Error(`CRE does not know chain selector ${CHAIN_NAME}`);
  const evmClient = new EVMClient(network.chainSelector.selector);

  const score = readUint(evmClient, runtime, RISK_SCORE, RISK_SCORE_ABI, "getScore", agentId);
  const acceptedIncidents = readUint(
    evmClient,
    runtime,
    INCIDENT_REGISTRY,
    INCIDENT_REGISTRY_ABI,
    "getAcceptedCount",
    agentId,
  );

  const triggered = score < SCORE_TRIGGER_THRESHOLD;
  const reason = triggered
    ? `score ${score} is below threshold ${SCORE_TRIGGER_THRESHOLD} -> payout due`
    : `score ${score} is at or above threshold ${SCORE_TRIGGER_THRESHOLD} -> no payout`;

  runtime.log(
    `[claimless] agent ${agentId}: score=${score} acceptedIncidents=${acceptedIncidents} ` +
      `threshold=${SCORE_TRIGGER_THRESHOLD} triggered=${triggered}`,
  );

  // When ParametricTrigger lands (Week 3), replace the log above with a write:
  //   const report = runtime.report({ encodedPayload: encode(...), encoderName: "<name>" }).result();
  //   evmClient.writeReport(runtime, { receiver: FORWARDER, report }).result();
  // The consumer contract then implements IReceiver.onReport(bytes,bytes).

  return {
    agentId: agentId.toString(),
    score,
    acceptedIncidents,
    threshold: SCORE_TRIGGER_THRESHOLD,
    triggered,
    reason,
  };
}

/* ──────────────────────────────── entrypoint ───────────────────────────── */

const initWorkflow = (config: NodeRuntime<TriggerInput>) => {
  const cron = new CronCapability();
  return [
    handler(
      cron.trigger({ schedule: "*/5 * * * *" }), // every 5 minutes
      evaluateTrigger,
      consensusIdenticalAggregation<TriggerEvaluation>(),
    ),
  ];
};

export async function main(): Promise<void> {
  const runner = await Runner.newRunner<TriggerInput>();
  await runner.run(initWorkflow);
}

// `bytesToHex` is imported for the write path's logging; reference it so the
// import is not flagged as unused while the write step is pending.
void bytesToHex;

await main();
