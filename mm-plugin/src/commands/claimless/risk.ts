import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { getAddresses, MONAD_TESTNET_CHAIN_ID } from "../../lib/config.js";
import { parseAgentId, readRisk } from "../../lib/inputs.js";

/** Inputs for `mm claimless risk`. */
const inputs = {
  agentId: {
    type: InputFieldType.Text,
    flag: "agentId",
    message: "ERC-8004 agent id to check (e.g. 42)",
    required: true,
    prompt: true,
    index: 0,
  },
} satisfies InputSchema;

export default class ClaimlessRisk extends PluginCommand<Awaited<ReturnType<typeof readRisk>>> {
  static override description =
    "Read an ERC-8004 agent's live on-chain risk score from Claimless (Monad testnet). " +
    "Shows the deterministic RiskScore (0..100, 100 = clean record), its band, and the " +
    "accepted-incident inputs behind it. Use this before hiring an agent.";

  static override examples = [
    "<%= config.bin %> claimless risk 42",
    "<%= config.bin %> claimless risk --agentId 42 --json",
  ];

  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  /** Must match package.json#mm.commands[].id. */
  protected readonly pluginCommandId = "claimless:risk";

  async execute(io: CommandIO): Promise<Awaited<ReturnType<typeof readRisk>>> {
    const { agentId: rawAgentId } = await io.resolveInputs(inputs);
    const agentId = parseAgentId(rawAgentId);

    // wallet-read capability: authenticated viem client on Monad testnet.
    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const addresses = await getAddresses();

    return readRisk(
      client,
      {
        riskScore: addresses.riskScore as `0x${string}`,
        incidentRegistry: addresses.incidentRegistry as `0x${string}`,
      },
      MONAD_TESTNET_CHAIN_ID,
      agentId,
    );
  }

  override successHint(data: Awaited<ReturnType<typeof readRisk>>): string {
    if (data.riskScore >= 90 && data.acceptedCount === 0) {
      return `agent ${data.agentId}: clean record (score ${data.riskScore}/100, LOW).`;
    }
    return `agent ${data.agentId}: score ${data.riskScore}/100 (${data.scoreBand}), ` +
      `${data.acceptedCount} accepted incident(s), severity sum ${data.severitySum}.`;
  }
}