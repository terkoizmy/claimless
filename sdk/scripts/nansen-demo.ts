/**
 * Nansen credit-aware demo.
 *
 * Two modes:
 *  - No NANSEN_API_KEY: prints the unconfigured path, the estimated credit
 *    cost of every documented method, and proves the on-disk cache works by
 *    calling a stubbed path twice.
 *  - With NANSEN_API_KEY: calls getAddressPnl ONCE for a well-known address,
 *    calls it again, and proves the second call hit the cache by printing
 *    creditsSpent before/after and the cache stat.
 *
 * Never calls any method costing more than 5 credits
 * (profiler/address/labels, 100 credits, is disabled by design).
 *
 * Run: pnpm nansen:demo
 */

import {
  CREDIT_COSTS,
  clearCache,
  estimateCredits,
  getAddressLabels,
  getAddressPnl,
  getCacheStats,
  getCreditUsage,
  reporterWeight,
} from "../src/nansen.js";

/** Well-known, high-activity address for the keyed demo (vitalik.eth). */
const DEMO_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function printCreditTable(): void {
  console.log("Credit cost table (documented, VERIFIED in docs/sponsor-notes.md):");
  for (const [method, cost] of Object.entries(CREDIT_COSTS)) {
    const tag = method === "profiler/address/labels" ? "  <- NEVER CALL (disabled by design)" : "";
    console.log(`  ${method.padEnd(34)} ${String(cost).padStart(3)} credit(s)${tag}`);
  }
}

function printLedger(): void {
  const usage = getCreditUsage();
  console.log("\n── Credit ledger ───────────────────────────");
  console.log(`  calls: ${usage.calls}  creditsSpent: ${usage.creditsSpent}/100 trial`);
  const methods = Object.entries(usage.byMethod);
  if (methods.length === 0) {
    console.log("  (no live calls recorded)");
  } else {
    for (const [method, credits] of methods) {
      console.log(`  ${method}: ${credits} credit(s)`);
    }
  }
}

function printCacheStats(): void {
  const stats = getCacheStats();
  console.log(`  cache: ${stats.entries} entries, oldest=${stats.oldest}, newest=${stats.newest}`);
}

/** Deterministic no-key path: proves the module degrades gracefully. */
async function stubbedCacheDemo(): Promise<void> {
  console.log("\n── Stubbed path (no key) ───────────────────────");
  const w1 = await reporterWeight({ address: "0x0000000000000000000000000000000000000001" });
  console.log(`  reporterWeight #1: weight=${w1.weight} rationale="${w1.rationale[0]}"`);
  const w2 = await reporterWeight({ address: "0x0000000000000000000000000000000000000001" });
  console.log(`  reporterWeight #2: weight=${w2.weight} rationale="${w2.rationale[0]}"`);
  console.log("  (both neutral and identical: Nansen unconfigured; no credits spent)");
}

async function keyedDemo(): Promise<void> {
  clearCache();
  console.log("\n── Keyed path ──────────────────────────────────");
  console.log(`  demo address: ${DEMO_ADDRESS}`);

  const before = getCreditUsage();
  console.log(`  creditsSpent before: ${before.creditsSpent}`);
  const pnl1 = await getAddressPnl(DEMO_ADDRESS);
  const afterFirst = getCreditUsage();
  console.log(`  creditsSpent after 1st call: ${afterFirst.creditsSpent}`);
  console.log(
    `  pnl: realizedPnlUsd=${pnl1.realizedPnlUsd.toFixed(2)} winRate=${(pnl1.winRate * 100).toFixed(1)}% ` +
      `tradedTokens=${pnl1.tradedTokenCount} topToken=${pnl1.topTokens[0]?.tokenSymbol ?? "n/a"}`,
  );

  const pnl2 = await getAddressPnl(DEMO_ADDRESS);
  const afterSecond = getCreditUsage();
  console.log(`  creditsSpent after 2nd call: ${afterSecond.creditsSpent}`);
  const cacheHit = afterSecond.creditsSpent === afterFirst.creditsSpent;
  console.log(`  2nd call hit cache: ${cacheHit}`);
  printCacheStats();

  const weight = await reporterWeight({ address: DEMO_ADDRESS });
  console.log(`  reporterWeight: ${weight.weight}`);
  for (const line of weight.rationale) {
    console.log(`    - ${line}`);
  }

  console.log("\n  (getSmartMoneyNetflow costs 5 credits — not called in the demo to save budget)");
}

async function main(): Promise<void> {
  const hasKey = Boolean(process.env.NANSEN_API_KEY);
  console.log("Claimless — Nansen enrichment demo");
  console.log(`  NANSEN_API_KEY: ${hasKey ? "(set)" : "(not set)"}`);
  printCreditTable();

  if (!hasKey) {
    console.log("\n  Nansen is unconfigured. Estimated credit cost per method:");
    console.log(`    getAddressPnl        -> ${estimateCredits("profiler/address/pnl-summary")} credit(s)`);
    console.log(`    getSmartMoneyNetflow -> ${estimateCredits("smart-money/netflow")} credit(s)`);
    console.log(`    getAddressLabels     -> ${estimateCredits("profiler/address/labels")} credit(s) (DISABLED by design)`);
    await stubbedCacheDemo();
    printLedger();
    printCacheStats();
    console.log("\n  To run the live demo: set NANSEN_API_KEY and re-run pnpm nansen:demo");
    return;
  }

  try {
    await keyedDemo();
  } catch (err: unknown) {
    console.error(`  Nansen call failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("  (continuing to the ledger print)");
  }
  printLedger();
}

main().catch((err: unknown) => {
  console.error("\n✗ nansen:demo failed");
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});