/**
 * Claimless SDK public surface.
 *
 * Read paths work with zero configuration (public RPC + local GraphQL).
 * Write paths require a signer; see `chain.ts`.
 *
 * NOTE for parallel work: this file is owned by the coordinator. If you add a
 * new module, do NOT edit this list — report it instead and it will be wired up.
 */

export * from "./config.js";
export * from "./env.js";
export * from "./types.js";
export * from "./chain.js";
export * from "./hash.js";
export * from "./registry.js";
export * from "./risk.js";
export * from "./envio.js";
export * from "./erc8004.js";
export * from "./intents.js";
export * from "./nansen.js";
export * from "./signer.js";
export * from "./privy.js";
export * from "./mera.js";

// Re-exported so consumers outside the sdk package (e.g. agents/) never need to
// resolve viem themselves; they import everything from the SDK surface.
export { formatEther, parseEther } from "viem";
