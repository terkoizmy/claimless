#!/usr/bin/env node
/**
 * list-tools: quick check that the built server exposes exactly the 4 tools.
 * Spawns dist/index.js, handshakes, lists tools, exits.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, "..", "dist", "index.js");

const child = spawn(process.execPath, [serverJs], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const EXPECTED = ["get_agent_identity", "get_agent_risk", "list_incidents", "report_incident"];

child.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if ((msg.id === 1 || msg.id === 2) && msg.result) {
      if (msg.result.tools === undefined) continue;
      const names = (msg.result.tools ?? []).map((t) => t.name).sort();
      const ok =
        names.length === EXPECTED.length && EXPECTED.every((n, i) => names[i] === n);
      console.log(`tools: ${names.join(", ")}`);
      console.log(ok ? "OK: exactly the 4 expected tools" : "MISMATCH");
      child.kill();
      process.exit(ok ? 0 : 1);
    }
  }
});

child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "list-tools", version: "0.0.1" },
    },
  }) + "\n",
);
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");

setTimeout(() => {
  console.error("timeout");
  child.kill();
  process.exit(1);
}, 30_000);