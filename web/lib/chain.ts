import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { CHAIN_ID, RPC_URL } from "./deployments";

/** Monad testnet (10143) — mirrors sdk/src/chain.ts. */
export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

/**
 * Read-only public client. There is deliberately no wallet client anywhere in
 * this app: the dashboard never signs anything.
 */
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(RPC_URL, { retryCount: 1, timeout: 20_000 }),
  }) as PublicClient;
}