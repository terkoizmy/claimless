/**
 * Shared viem clients for the Claimless SDK.
 *
 * Two clients, deliberately separate:
 *  - `publicClient`  : read-only, works with zero configuration.
 *  - `walletClient`  : only created when a private key is supplied; used for
 *                      write paths (reporting incidents, publishing summaries).
 *
 * No worker or demo should construct its own client. Import from here so the
 * chain/address configuration stays in one place.
 */

import { createPublicClient, createWalletClient, http, type Account, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { MONAD_TESTNET_CHAIN_ID } from "./config.js";
import { readEnv, type ClaimlessEnv } from "./env.js";

/** Monad testnet chain definition (chain 10143). */
export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

export interface Clients {
  env: ClaimlessEnv;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Account;
}

/** Build read (and optionally write) clients from the environment. */
export function createClients(env: ClaimlessEnv = readEnv()): Clients {
  const transport = http(env.rpcUrl, { retryCount: 2, timeout: 20_000 });

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport,
  }) as PublicClient;

  if (!env.privateKey) {
    return { env, publicClient };
  }

  const key = env.privateKey.startsWith("0x") ? env.privateKey : `0x${env.privateKey}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport,
  });

  return { env, publicClient, walletClient, account };
}

/** Read-only client. Safe to call anywhere, no credentials needed. */
export function getPublicClient(env?: ClaimlessEnv): PublicClient {
  return createClients(env).publicClient;
}

/**
 * Write client. Throws a clear error if no key is configured, rather than
 * failing deep inside a transaction call.
 */
export function requireWallet(env?: ClaimlessEnv): { walletClient: WalletClient; account: Account; publicClient: PublicClient } {
  const clients = createClients(env);
  if (!clients.walletClient || !clients.account) {
    throw new Error(
      "No signer configured. Set MONAD_PRIVATE_KEY in the environment to use write paths.",
    );
  }
  return {
    walletClient: clients.walletClient,
    account: clients.account,
    publicClient: clients.publicClient,
  };
}

/** Assert the RPC is the chain we expect before doing anything stateful. */
export async function assertChainId(client: PublicClient, expected = MONAD_TESTNET_CHAIN_ID): Promise<void> {
  const id = await client.getChainId();
  if (id !== expected) {
    throw new Error(`Connected to chain ${id}, expected ${expected}. Check MONAD_RPC_URL.`);
  }
}

/** Assert a contract actually has bytecode, for the "testnet reset" failure mode. */
export async function assertHasCode(client: PublicClient, address: `0x${string}`, label: string): Promise<void> {
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`No bytecode at ${address} (${label}). Monad testnet may have been reset.`);
  }
}
