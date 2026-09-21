/**
 * Exercises loadAddresses() against the real monorepo deployment file.
 * Run with: node scripts/check-addresses.mjs
 * Verifies both the override path (deployment file read) and the fallback.
 */
import fs from "node:fs";
import path from "node:path";

async function main() {
  const target = path.resolve("..", "contracts", "deployments", "monad-testnet.json");
  const backup = fs.readFileSync(target, "utf8");
  try {
    // 1. Override path: mutate the file and confirm the loader picks it up.
    fs.writeFileSync(
      target,
      backup.replace(
        "0x5cFA4968a9225fd5bCAbF88B6A35A9748E6215F4",
        "0x1111111111111111111111111111111111111111",
      ),
    );
    const mod = await import("../dist/lib/config.js");
    const overridden = await mod.loadAddresses();
    if (overridden.riskScore !== "0x1111111111111111111111111111111111111111") {
      throw new Error("deployment-file override did not take effect: " + overridden.riskScore);
    }
    console.log("PASS: deployment-file override read correctly");
  } finally {
    // 2. Restore and verify the normal value resolves.
    fs.writeFileSync(target, backup);
  }
  const mod2 = await import("../dist/lib/config.js");
  const normal = await mod2.loadAddresses();
  if (normal.riskScore !== mod2.FALLBACK_ADDRESSES.riskScore) {
    throw new Error("restored file mismatch: " + normal.riskScore);
  }
  console.log("PASS: normal deployment resolves; file intact");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});