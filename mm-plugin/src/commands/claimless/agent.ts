import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { getAddresses, ERC8004_REGISTRIES, shortAddress, MONAD_TESTNET_CHAIN_ID } from "../../lib/config.js";
import { parseAgentId, readAgent } from "../../lib/inputs.js";

/** Inputs for `mm claimless agent`. */
const inputs = {
  agentId: {
    type: InputFieldType.Text,
    flag: "agentId",
    message: "ERC-8004 agent id to resolve (e.g. 42)",
    required: true,
    prompt: true,
    index: 0,
  },
} satisfies InputSchema;

export default class ClaimlessAgent extends PluginCommand<Awaited<ReturnType<typeof readAgent>>> {
  static override description =
    "Resolve an ERC-8004 agent's on-chain identity and Claimless reputation. " +
    "Reads the canonical IdentityRegistry (owner + agent wallet) and the " +
    "Claimless risk summary published into the canonical ReputationRegistry.";

  static override examples = [
    "<%= config.bin %> claimless agent 42",
    "<%= config.bin %> claimless agent --agentId 42 --json",
  ];

  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  /** Must match package.json#mm.commands[].id. */
  protected readonly pluginCommandId = "claimless:agent";

  async execute(io: CommandIO): Promise<Awaited<ReturnType<typeof readAgent>>> {
    const { agentId: rawAgentId } = await io.resolveInputs(inputs);
    const agentId = parseAgentId(rawAgentId);

    // wallet-read capability: authenticated viem client on Monad testnet.
    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const addresses = await getAddresses();

    return readAgent(
      client,
      {
        agentIdentity: addresses.agentIdentity as `0x${string}`,
        identityRegistry: ERC8004_REGISTRIES.identityRegistry,
        reputationRegistry: ERC8004_REGISTRIES.reputationRegistry,
      },
      MONAD_TESTNET_CHAIN_ID,
      agentId,
    );
  }

  override successHint(data: Awaited<ReturnType<typeof readAgent>>): string {
    const wallet = data.agentWallet ? shortAddress(data.agentWallet) : "none";
    const rep = data.reputation;
    const repText =
      rep.count >= 0
        ? `${rep.count} summary(ies), value ${rep.rendered} (scale ${rep.decimals})`
        : "no summary available";
    return `agent ${data.agentId}: owner ${shortAddress(data.owner)}, wallet ${wallet}, reputation: ${repText}`;
  }
}