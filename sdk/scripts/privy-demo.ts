/**
 * Live Privy agent-wallet check.
 *
 * Proves the Privy path end-to-end against the real API:
 *   1. create (or reuse) an agent wallet
 *   2. read its address
 *   3. sign a message through the wallet's RPC
 *   4. verify the signature recovers to the wallet address
 *
 * Step 4 is the part that matters: a 200 response is not proof that the
 * signature is valid, only that Privy replied. Recovering the signer from the
 * signature does prove it.
 *
 * Usage: npx tsx scripts/privy-demo.ts
 */

import { verifyMessage } from "viem";
import { createPrivySigner } from "../src/signer.js";
import { describePrivy, formatPrivyStatus } from "../src/privy.js";
import { readEnv } from "../src/env.js";

async function main() {
  const env = readEnv();

  console.log("Claimless — live Privy agent wallet check");
  console.log("=".repeat(64));
  console.log(`status: ${formatPrivyStatus(env)}`);

  const status = describePrivy(env);
  if (!status.configured) {
    console.error(`\nNot configured: ${status.reason}`);
    console.error("Set PRIVY_APP_ID and PRIVY_APP_SECRET in .env");
    process.exit(1);
  }

  console.log("\n1) Creating / reusing a Privy agent wallet...");
  const signer = await createPrivySigner({
    appId: env.privyAppId!,
    appSecret: env.privyAppSecret!,
    env,
  });
  const address = await signer.address();
  console.log(`   kind    = ${signer.kind}`);
  console.log(`   address = ${address}`);

  console.log("\n2) Signing a message via Privy's wallet RPC...");
  const message = "Claimless agent-wallet signature check";
  const signature = await signer.account.signMessage({ message });
  console.log(`   signature = ${signature.slice(0, 42)}...`);

  console.log("\n3) Verifying the signature recovers to the wallet address...");
  const ok = await verifyMessage({
    address,
    message,
    signature,
  });

  console.log("=".repeat(64));
  if (ok) {
    console.log("[PASS] Privy agent wallet signs, and the signature verifies");
    console.log("       The private key never touched this process.");
  } else {
    console.log("[FAIL] signature did not recover to the wallet address");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
