/**
 * @claimless/langchain-tools — Claimless tools for LangChain and the Vercel AI SDK.
 *
 * Four agent tools over the SAME @claimless/sdk used by the MCP server and the
 * MetaMask plugin (Monad testnet, chain 10143):
 *
 *   claimless_get_agent_identity  read   ERC-8004 identity (owner, agentWallet, tokenURI)
 *   claimless_get_agent_risk      read   live RiskScore score/band + ERC-8004 reputation
 *   claimless_list_incidents      read   IncidentRegistry history for an agent
 *   claimless_report_incident     WRITE  staked incident report; SPENDS MON; dry_run defaults true
 *
 * Read tools need zero configuration. The write tool needs MONAD_PRIVATE_KEY.
 *
 * Subpath exports:
 *   "@claimless/langchain-tools"           shared definitions + this re-export barrel
 *   "@claimless/langchain-tools/langchain" DynamicStructuredTool wrappers
 *   "@claimless/langchain-tools/vercel"    ai.tool() wrappers
 */

export * from "./tools.js";
export {
  claimlessDynamicTool,
  claimlessLangChainTools,
  claimlessReadTools,
  claimlessReportIncidentTool,
} from "./langchain.js";
export type { ClaimlessStructuredTool } from "./langchain.js";
export {
  claimlessVercelReadTools,
  claimlessVercelReportTool,
  claimlessVercelTools,
} from "./vercel.js";