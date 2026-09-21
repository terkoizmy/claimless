/**
 * LangChain adapters for the Claimless tools.
 *
 * Wraps the shared `tools.ts` definitions into LangChain
 * `DynamicStructuredTool`s (from @langchain/core/tools) with the same zod
 * schemas, so the write tool keeps its dry-run default and the read tools
 * keep their zero-config live RPC behaviour. Usable with any LangChain
 * agent (createReactAgent, LangGraph ToolNode, etc.).
 *
 * ```ts
 * import { claimlessLangChainTools } from "@claimless/langchain-tools/langchain";
 * const tools = claimlessLangChainTools(); // [identity, risk, incidents, report]
 * ```
 */

import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import {
  type ClaimlessToolDef,
  claimlessToolDefs,
  type ToolResult,
} from "./tools.js";

/**
 * Wrap one shared tool definition into a LangChain DynamicStructuredTool.
 *
 * LangChain tools surface errors to the LLM as tool outputs rather than
 * crashing the agent, so failures (reverts, missing signer, bad input) are
 * returned as `error` strings. The dry-run default on the write tool is
 * preserved: an agent must pass dry_run=false explicitly to spend MON.
 */
export function claimlessDynamicTool(def: ClaimlessToolDef): DynamicStructuredTool<z.ZodObject<z.ZodRawShape>> {
  return new DynamicStructuredTool({
    name: def.name,
    description: def.description,
    schema: def.schema as z.ZodObject<z.ZodRawShape>,
    func: async (input: z.infer<z.ZodObject<z.ZodRawShape>>): Promise<string> => {
      try {
        const result = await def.run(input as never);
        return JSON.stringify(result);
      } catch (err) {
        // Never throw out of a tool: hand the failure to the model as text.
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          tool: def.name,
        });
      }
    },
  });
}

/** All four Claimless tools as LangChain DynamicStructuredTools, in order. */
export function claimlessLangChainTools(): Array<DynamicStructuredTool<z.ZodObject<z.ZodRawShape>>> {
  return claimlessToolDefs().map(claimlessDynamicTool);
}

/** The three read-only tools (safe; no signer, no funds). */
export function claimlessReadTools(): Array<DynamicStructuredTool<z.ZodObject<z.ZodRawShape>>> {
  return claimlessLangChainTools().filter((t) => t.name !== "claimless_report_incident");
}

/**
 * The write tool on its own, so hosts can gate it behind explicit user
 * confirmation. It still defaults to dry_run=true; spending requires
 * `dry_run=false` in the tool input AND a funded MONAD_PRIVATE_KEY.
 */
export function claimlessReportIncidentTool(): DynamicStructuredTool<z.ZodObject<z.ZodRawShape>> {
  return claimlessDynamicTool(
    claimlessToolDefs().find((d) => d.destructive) as ClaimlessToolDef,
  );
}

/** Union type so hosts can type tool arrays loosely. */
export type ClaimlessStructuredTool = StructuredToolInterface & { name: string };

/** Re-export for callers that want the raw result objects per tool. */
export type { ToolResult };