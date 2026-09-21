import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
  CommandError,
} from "@metamask/agent-wallet/plugin";
import { encodeFunctionData } from "viem";
import { getAddresses, formatWei, MONAD_TESTNET_CHAIN_ID } from "../../lib/config.js";
import {
  parseAgentId,
  parseSeverity,
  parseEvidenceHash,
  parseWei,
  kindHash,
  describeError,
  type ReportResult,
} from "../../lib/inputs.js";
import { INCIDENT_REGISTRY_ABI } from "../../lib/abis.js";

/** Inputs for `mm claimless report`. */
const inputs = {
  agentId: {
    type: InputFieldType.Text,
    flag: "agentId",
    message: "ERC-8004 agent id the incident is about (e.g. 42)",
    required: true,
    prompt: true,
    index: 0,
  },
  kind: {
    type: InputFieldType.Text,
    flag: "kind",
    message: "Incident kind, e.g. SLA_BREACH, LATENCY, WRONG_ANSWER",
    required: true,
    prompt: true,
    index: 1,
  },
  severity: {
    type: InputFieldType.Text,
    flag: "severity",
    message: "Severity 1..5 (1=minor, 3=major, 5=catastrophic)",
    required: true,
    prompt: true,
    index: 2,
  },
  evidenceHash: {
    type: InputFieldType.Text,
    flag: "evidenceHash",
    message: "Evidence commitment (0x + 64 hex chars) or a string to hash",
    required: true,
    prompt: true,
    index: 3,
  },
  stake: {
    type: InputFieldType.Text,
    flag: "stake",
    message: "Stake in wei (must be >= the registry minStake)",
    required: true,
    prompt: true,
    index: 4,
  },
} satisfies InputSchema;

export default class ClaimlessReport extends PluginCommand<ReportResult> {
  static override description =
    "Report a staked incident about an ERC-8004 agent on Monad testnet. " +
    "Submits IncidentRegistry.reportIncident(agentId, kind, severity, evidenceHash) " +
    "with your stake through the host wallet executor, so the transaction is " +
    "policy-gated by MetaMask. The stake is bonded: a challenger can match it " +
    "within the 3-day challenge window, and the dispute winner takes both bonds.";

  static override examples = [
    "<%= config.bin %> claimless report 42 SLA_BREACH 3 <evidenceHash> <stakeWei>",
    "<%= config.bin %> claimless report --agentId 42 --kind SLA_BREACH --severity 3 " +
      "--evidenceHash <hash-or-string> --stake 10000000000000000 --json",
  ];

  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  /** Must match package.json#mm.commands[].id. */
  protected readonly pluginCommandId = "claimless:report";

  async execute(io: CommandIO): Promise<ReportResult> {
    const { agentId: rawAgentId, kind, severity, evidenceHash, stake } =
      await io.resolveInputs(inputs);

    const agentId = parseAgentId(rawAgentId);
    const severityNum = parseSeverity(severity);
    const evidence = parseEvidenceHash(evidenceHash);
    const stakeWei = parseWei(stake);
    const kindHashValue = kindHash(kind.trim());

    const addresses = await getAddresses();
    const incidentRegistry = addresses.incidentRegistry as `0x${string}`;

    // wallet-read capability covers the pre-flight read below.
    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    let minStake: bigint;
    try {
      minStake = (await client.readContract({
        address: incidentRegistry,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "minStake",
        args: [],
      })) as bigint;
    } catch (err) {
      throw new CommandError(
        "CONTRACT_READ_FAILED",
        `IncidentRegistry.minStake() failed on ${incidentRegistry}: ${describeError(err)}`,
        "Check network status and retry.",
      );
    }

    if (stakeWei < minStake) {
      throw new CommandError(
        "INVALID_INPUT",
        `Stake ${stakeWei.toString()} wei is below the registry minimum of ` +
          `${minStake.toString()} wei (${formatWei(minStake)}).`,
        "Raise the stake to at least the minimum.",
      );
    }

    // Encode exactly what IncidentRegistry.reportIncident expects:
    // (uint256 agentId, bytes32 kind, uint8 severity, bytes32 evidenceHash), payable stake.
    const data = encodeFunctionData({
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "reportIncident",
      args: [agentId, kindHashValue, severityNum, evidence],
    });

    // wallet-submit capability: the executor is async in SDK 7 and every
    // request routes through MetaMask policy.
    const executor = await this.ctx.walletExecutor(io, this.pluginCommandId);
    let txHash: string | null = null;
    let status = "submitted";
    try {
      const result = await executor({
        kind: "transaction",
        chainId: MONAD_TESTNET_CHAIN_ID,
        transaction: {
          to: incidentRegistry,
          data,
          value: stakeWei,
        },
      });
      if (result.kind !== "transaction") {
        throw new CommandError(
          "WALLET_SUBMIT_FAILED",
          `Unexpected executor result kind "${result.kind}" for a transaction request.`,
          "Retry the command; if it persists, reinstall the plugin.",
        );
      }
      txHash = typeof result.hash === "string" ? result.hash : null;
      status = typeof result.status === "string" ? result.status : "submitted";
    } catch (err) {
      throw new CommandError(
        "WALLET_SUBMIT_FAILED",
        `MetaMask wallet submission failed: ${describeError(err)}`,
        "Approve the request in MetaMask or retry with a sufficient balance.",
      );
    }

    return {
      command: "claimless:report",
      chainId: MONAD_TESTNET_CHAIN_ID,
      incidentId: "pending",
      agentId: agentId.toString(),
      kind: kind.trim(),
      kindHash: kindHashValue,
      severity: severityNum,
      evidenceHash: evidence,
      stakeWei: stakeWei.toString(),
      transactionHash: txHash,
      status,
      incidentRegistry,
      note:
        "Incident filed with stake. It stays challengeable for 3 days; after the " +
        "window it finalizes as ACCEPTED and the stake is at risk until the " +
        "dispute resolves. Track it with `claimless risk`.",
    };
  }

  override successHint(data: ReportResult): string {
    const short = data.transactionHash
      ? `${data.transactionHash.slice(0, 10)}…${data.transactionHash.slice(-6)}`
      : "unknown";
    return `incident reported for agent ${data.agentId} (tx ${short}, stake ${data.stakeWei} wei).`;
  }
}