import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";

/** Liveness inputs: no arguments, no capabilities. */
const inputs = {} satisfies InputSchema;

/** Static version mirrored from package.json (updated at release time). */
const PLUGIN_VERSION = "0.1.0";

export default class ClaimlessPing extends PluginCommand<{
  plugin: string;
  version: string;
  message: string;
}> {
  static override description =
    "Check that the Claimless plugin is installed and alive (no wallet needed).";

  static override examples = [
    "<%= config.bin %> claimless ping",
    "<%= config.bin %> claimless ping --json",
  ];

  // Pure plugin check: no sign-in, no wallet setup, no capabilities.
  static override requiresAuth = false;
  static override requiresInit = false;

  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  /** Must match package.json#mm.commands[].id. */
  protected readonly pluginCommandId = "claimless:ping";

  async execute(_io: CommandIO): Promise<{ plugin: string; version: string; message: string }> {
    return {
      plugin: "claimless-mm-plugin",
      version: PLUGIN_VERSION,
      message: "pong",
    };
  }

  override successHint(data: { version: string }): string {
    return `claimless plugin alive (v${data.version}): pong`;
  }
}