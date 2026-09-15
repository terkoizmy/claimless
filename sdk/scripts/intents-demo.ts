/**
 * Aurora Intents (any-chain deposit) demo.
 *
 * Runs the full read-only integration flow with NO env vars and NO funds:
 *
 *  1. List a few Monad tokens from the NEAR Intents registry (/v0/tokens).
 *  2. Get a `dry: true` quote for 0.50 USDC from Base USDC to Monad USDC.
 *  3. Print the formatted quote (amounts, time estimate, deposit address).
 *  4. Look up the status for that deposit address, tolerating "not found".
 *
 * IMPORTANT: this is a MAINNET-ASSET quote because Aurora Intents has no
 * testnet and never will (verified, do not re-research). Nothing is spent:
 * `dry: true` validates and prices the swap without executing, and no
 * deposit is ever sent.
 *
 * Run: pnpm intents:demo
 */

import {
  getTokens,
  filterByBlockchain,
  quoteMonadUsdcDeposit,
  getStatus,
  formatQuote,
  BASE_USDC_ASSET_ID,
  MONAD_USDC_ASSET_ID,
} from "../src/intents.js";

/** Placeholder recipient/refund for the dry quote (a dead address). */
const PLACEHOLDER_RECIPIENT = "0x1111111111111111111111111111111111111111";
const DEMO_AMOUNT_USDC = "0.50";

async function main(): Promise<void> {
  console.log("Claimless — Aurora Intents (NEAR Intents 1Click) demo");
  console.log("  NOTE: mainnet assets are used because Aurora Intents has no");
  console.log("  testnet. No funds were spent: this is a dry:true quote only.");

  // 1. Asset discovery -------------------------------------------------------
  console.log("\n── Step 1: Monad tokens from the Intents registry ──────────");
  const tokens = await getTokens();
  const monadTokens = filterByBlockchain(tokens, "monad");
  console.log(`  registry: ${tokens.length} assets, ${monadTokens.length} on Monad`);
  for (const t of monadTokens.slice(0, 5)) {
    console.log(
      `    ${t.symbol.padEnd(6)} ${t.assetId} ` +
        `(decimals=${t.decimals}${t.price !== undefined ? `, price≈$${t.price}` : ""})`,
    );
  }

  // 2. Dry quote -------------------------------------------------------------
  console.log("\n── Step 2: dry:true quote — 0.50 USDC (Base) → USDC (Monad) ─");
  console.log(`  origin asset:      ${BASE_USDC_ASSET_ID}`);
  console.log(`  destination asset: ${MONAD_USDC_ASSET_ID}`);
  const quote = await quoteMonadUsdcDeposit({
    amountUsdc: DEMO_AMOUNT_USDC,
    recipient: PLACEHOLDER_RECIPIENT,
    refundTo: PLACEHOLDER_RECIPIENT,
    dry: true,
  });
  console.log(formatQuote(quote));

  // 3. Status lookup ---------------------------------------------------------
  console.log("\n── Step 3: status lookup for the quote's deposit address ───");
  const depositAddress = quote.quote.depositAddress;
  if (!depositAddress) {
    console.log(
      "  (no deposit address in the dry quote — per the 1Click API docs," +
        " dry responses omit it, so there is nothing to look up yet)",
    );
  } else {
    try {
      const status = await getStatus({ depositAddress });
      if (status.status === "NOT_FOUND") {
        console.log(
          `  status: NOT_FOUND (expected — nothing was ever deposited to ` +
            `${depositAddress}; tolerating the API's 404)`,
        );
      } else {
        console.log(`  status: ${status.status}`);
        if (status.amountInFormatted !== undefined) {
          console.log(`  amount in: ${status.amountInFormatted}`);
        }
        if (status.amountOut !== undefined) {
          console.log(`  amount out: ${status.amountOut}`);
        }
      }
    } catch (err) {
      console.log(`  status lookup failed (tolerated): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\nDone. No funds were spent — the quote was dry:true on mainnet");
  console.log("assets because Aurora Intents has no testnet.");
}

main().catch((err: unknown) => {
  console.error("\n✗ intents:demo failed");
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});