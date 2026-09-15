/**
 * Risk score demo — agent 10182 on Monad testnet.
 *
 * Run: pnpm risk:demo
 *
 * Part 1 hits the deployed RiskScore contract for real data: the live
 * score, the full bundle (accepted count + severity sum), the stored
 * score, hasScore, and the FREQ_WEIGHT / SEV_WEIGHT / MAX_SCORE constants.
 *
 * Part 2 is fully offline and self-contained: it re-runs `getScore`
 * against a deliberately broken RPC URL with a stub `IndexerScoreReader`,
 * showing the contract-first / indexer-fallback path choosing the
 * indexer and labeling the result `source: "indexer"`.
 */

import { readEnv } from "../src/env.js";
import {
  RISKSCORE_ADDRESS,
  clearScoreCache,
  formatScore,
  getScore,
  getScoreBundle,
  getScoreFromContract,
  getStoredScore,
  hasScore,
  type IndexerScoreReader,
} from "../src/risk.js";
import { monadTestnet } from "../src/chain.js";

const AGENT_ID = 10182n;

async function main(): Promise<void> {
  console.log(`RiskScore demo — agent ${AGENT_ID} on Monad testnet`);
  console.log(`RiskScore contract: ${RISKSCORE_ADDRESS}`);
  console.log("=".repeat(64));

  // ----------------------------------------------------------------
  // Part 1 — real on-chain reads.
  // ----------------------------------------------------------------
  const env = readEnv();

  const contractScore = await getScoreFromContract(AGENT_ID, env);
  console.log("\n[1] getScoreFromContract");
  console.log(`    score        = ${contractScore.score}`);
  console.log(`    accepted     = ${contractScore.acceptedCount}`);
  console.log(`    severitySum  = ${contractScore.severitySum}`);
  console.log(`    source       = ${contractScore.source}`);
  console.log(`    formatted    = ${formatScore(contractScore.score)}`);

  const bundle = await getScoreBundle(AGENT_ID, env);
  console.log("\n[2] getScoreBundle (live score + registry inputs + weights)");
  console.log(`    score        = ${bundle.score}`);
  console.log(`    accepted     = ${bundle.acceptedCount}`);
  console.log(`    severitySum  = ${bundle.severitySum}`);
  console.log(`    MAX_SCORE    = ${bundle.maxScore}`);
  console.log(`    FREQ_WEIGHT  = ${bundle.freqWeight}`);
  console.log(`    SEV_WEIGHT   = ${bundle.sevWeight}`);
  console.log(
    `    formula check: 100 - min(100, ${bundle.acceptedCount}*${bundle.freqWeight} + ${bundle.severitySum}*${bundle.sevWeight})` +
      ` = ${Math.max(0, 100 - Math.min(100, bundle.acceptedCount * bundle.freqWeight + bundle.severitySum * bundle.sevWeight))}`,
  );

  const stored = await getStoredScore(AGENT_ID, env);
  const exists = await hasScore(AGENT_ID, env);
  console.log("\n[3] stored score / hasScore");
  console.log(`    hasScore     = ${exists}`);
  console.log(`    stored score = ${stored}`);

  // ----------------------------------------------------------------
  // Part 2 — offline fallback demo: broken RPC + stub reader.
  // ----------------------------------------------------------------
  const brokenEnv = { ...readEnv(), rpcUrl: "http://127.0.0.1:9" /* nothing listens here */ };

  const stubReader: IndexerScoreReader = {
    // Stands in for the Envio indexer's getAgent query.
    async getAgent(agentId: string) {
      // Mirrors the real on-chain state: 1 accepted incident, severity 4.
      return { currentScore: "87", acceptedCount: 1, severitySum: "4" };
    },
  };

  console.log("\n[4] fallback demo (broken RPC + stub indexer reader)");
  console.log("    forcing contract read to fail via unreachable rpcUrl http://127.0.0.1:9");

  // Fresh client + cache bypass so the demo does not accidentally read the
  // cached contract answer from part 1.
  clearScoreCache();
  const fallbackScore = await getScore(AGENT_ID, { reader: stubReader, ttlMs: 0, env: brokenEnv });
  console.log(`    -> source    = ${fallbackScore.source}   (indexer fallback won)`);
  console.log(`    -> score     = ${fallbackScore.score}`);
  console.log(`    -> formatted = ${formatScore(fallbackScore.score)}`);

  console.log("\nOK: contract reads live, fallback path proven offline.");
}

main().catch((err) => {
  console.error(`risk-demo failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});