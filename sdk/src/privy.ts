/**
 * Claimless SDK — Privy agent-wallet integration.
 *
 * Privy provides wallets for AI AGENTS: keys live in a TEE, the agent process
 * only ever holds a short-lived ephemeral signing key, and a policy engine caps
 * what the wallet will sign. That is the production path for an autonomous agent
 * that must report incidents with no human present.
 *
 * This module is a thin, well-documented wrapper over `signer.ts`:
 *   - `isPrivyConfigured()` / `describePrivy()` report readiness without throwing
 *   - `createAgentSigner()` returns a Signer backed by a Privy wallet
 *   - `PRIVY_AGENT_WALLET_NOTES` records the verified product facts, so nobody
 *     has to re-research them
 *
 * STATUS: CODE COMPLETE, LIVE TEST PENDING. We have no Privy credentials yet, so
 * nothing here has been exercised against the live API. Everything network-facing
 * is isolated in `signer.ts#createPrivySigner` so going live touches one function.
 * The local-key fallback keeps the agent demo working meanwhile.
 *
 * Bounty: "Privy!" ($5,000). It requires more than login: an AGENT WALLET plus
 * the policy engine. Login-only implementations do not count.
 */

import { createSignerPlaceholder } from "./signer.js";
import { readEnv, type ClaimlessEnv } from "./env.js";

/**
 * Verified Privy facts (docs.privy.io, agent wallets + pricing). Kept in code so
 * the integration's constraints travel with it.
 */
export const PRIVY_AGENT_WALLET_NOTES = {
  freeTier: "0-499 MAU plus 50,000 signatures/month",
  mauCounting:
    "A user counts as MAU only with an active logged-in session. Agent wallets that never log in do NOT consume MAU, which is why Privy suits many-agent workloads.",
  keyCustody: "Keys live in a TEE. The agent gets an ephemeral signing key; the private key is never exposed to the agent process.",
  policyEngine: "Per-transaction caps, per-period caps, and allowlists are included on the free tier.",
  payments: "x402 and MPP are built in.",
  monad: "Compatible via supportedChains / defaultChain configuration.",
  caveat: "Whether signup requires a credit card is UNVERIFIED. The free tier is $0 regardless.",
} as const;

export interface PrivyStatus {
  configured: boolean;
  appId?: string;
  /** Never exposes the secret; only whether it is present. */
  hasSecret: boolean;
  reason: string;
}

/** Reports Privy readiness without throwing. Safe to call anywhere. */
export function describePrivy(env: ClaimlessEnv = readEnv()): PrivyStatus {
  const appId = env.privyAppId;
  const hasSecret = Boolean(env.privyAppSecret);
  if (appId && hasSecret) {
    return { configured: true, appId, hasSecret, reason: "PRIVY_APP_ID and PRIVY_APP_SECRET are set" };
  }
  if (appId && !hasSecret) {
    return { configured: false, appId, hasSecret, reason: "PRIVY_APP_SECRET is missing" };
  }
  if (!appId && hasSecret) {
    return { configured: false, hasSecret, reason: "PRIVY_APP_ID is missing" };
  }
  return { configured: false, hasSecret: false, reason: "no Privy credentials configured" };
}

/** Convenience boolean wrapper. */
export function isPrivyConfigured(env: ClaimlessEnv = readEnv()): boolean {
  return describePrivy(env).configured;
}

/**
 * Returns a Signer backed by a Privy agent wallet.
 *
 * Delegates to the signer layer, which currently reports clearly that the live
 * path is unverified and refuses to hand back a half-working signer. Once Privy
 * credentials exist and the two REST paths in `signer.ts` are confirmed, this
 * call starts returning a real signer with no change to callers.
 *
 * @throws SignerUnavailableError when Privy is not configured.
 */
export async function createAgentSigner(env: ClaimlessEnv = readEnv()) {
  const status = describePrivy(env);
  if (!status.configured) {
    throw new Error(
      `Privy is not configured (${status.reason}). Set PRIVY_APP_ID and PRIVY_APP_SECRET, ` +
        "or use MONAD_PRIVATE_KEY for the local fallback demo signer.",
    );
  }
  return createSignerPlaceholder(env);
}

/** A one-line human summary for logs and the demo output. */
export function formatPrivyStatus(env: ClaimlessEnv = readEnv()): string {
  const s = describePrivy(env);
  if (s.configured) return `configured (appId=${s.appId})`;
  return `not configured — ${s.reason}`;
}
