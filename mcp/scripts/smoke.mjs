#!/usr/bin/env node
/**
 * Stdio verification harness for the Claimless MCP server.
 *
 * Spawns the built server (node dist/index.js) as a child process, performs a
 * real MCP handshake over stdio, lists tools, and calls each tool with real
 * arguments. Everything printed comes from real contract reads or real tool
 * errors - no mocks anywhere.
 *
 * Usage: node scripts/smoke.mjs
 */

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, "..", "dist", "index.js");

const child = spawn(process.execPath, [serverJs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env }, // deliberately inherits no MONAD_PRIVATE_KEY unless the shell has one
});

let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      console.error("[smoke] non-JSON on stdout (BUG):", line.slice(0, 200));
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(`[server:stderr] ${chunk}`);
});

child.on("exit", (code) => {
  console.error(`[smoke] server exited with code ${code}`);
});

function send(method, params) {
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(body);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 120_000);
  });
}

function show(label, result) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(result, null, 2));
}

function showToolText(label, res) {
  console.log(`\n=== ${label} ===`);
  if (res.error) {
    console.log(`ERROR: ${JSON.stringify(res.error)}`);
    return;
  }
  for (const part of res.result?.content ?? []) {
    if (part.type === "text") console.log(part.text);
    else console.log(JSON.stringify(part));
  }
}

async function main() {
  // 1. initialize handshake
  const init = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "claimless-smoke", version: "0.0.1" },
  });
  console.log("=== initialize ===");
  console.log(JSON.stringify(init.result, null, 2));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // 2. list tools - must be exactly 4
  const listed = await send("tools/list", {});
  const names = (listed.result?.tools ?? []).map((t) => t.name).sort();
  console.log("\n=== tools/list ===");
  console.log("tool count:", names.length);
  console.log("tool names:", JSON.stringify(names, null, 2));
  for (const tool of listed.result?.tools ?? []) {
    console.log(`\n--- ${tool.name} ---`);
    console.log("description:", (tool.description ?? "").slice(0, 220));
    console.log("annotations:", JSON.stringify(tool.annotations ?? {}));
    console.log(
      "inputSchema.required:",
      JSON.stringify((tool.inputSchema?.required ?? []).sort()),
    );
  }

  // 3. real calls. agentId 0 exists in the canonical registry (scanned on-chain):
  // owner 0x0b3DD790A902D1E0F1782c2A130336B1398f68Ea. Also demonstrate the
  // clean failure path for a nonexistent id (999999).
  const AGENT = "0";

  const ident = await send("tools/call", {
    name: "get_agent_identity",
    arguments: { agentId: AGENT },
  });
  showToolText(`tools/call get_agent_identity(agentId=${AGENT})`, ident);

  const identMissing = await send("tools/call", {
    name: "get_agent_identity",
    arguments: { agentId: "999999" },
  });
  showToolText("tools/call get_agent_identity(agentId=999999, nonexistent)", identMissing);

  const risk = await send("tools/call", {
    name: "get_agent_risk",
    arguments: { agentId: AGENT },
  });
  showToolText(`tools/call get_agent_risk(agentId=${AGENT})`, risk);

  const incidents = await send("tools/call", {
    name: "list_incidents",
    arguments: { agentId: AGENT },
  });
  showToolText(`tools/call list_incidents(agentId=${AGENT})`, incidents);

  // report_incident without MONAD_PRIVATE_KEY: must fail with a clear message
  const report = await send("tools/call", {
    name: "report_incident",
    arguments: {
      agentId: AGENT,
      kind: "SLA_BREACH",
      severity: 3,
      evidence: { detail: "smoke-test evidence commitment", detectedAt: new Date().toISOString() },
      dryRun: true,
    },
  });
  showToolText(`tools/call report_incident(dryRun=true, no signer configured)`, report);

  // report_incident non-dry without signer: must fail cleanly with a clear message
  const reportLive = await send("tools/call", {
    name: "report_incident",
    arguments: {
      agentId: AGENT,
      kind: "SLA_BREACH",
      severity: 3,
      evidence: { detail: "smoke-test live attempt (expected to fail cleanly: no signer)" },
      dryRun: false,
    },
  });
  showToolText(`tools/call report_incident(dryRun=false, no signer configured)`, reportLive);

  console.log("\n[smoke] done");
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  child.kill();
  process.exit(1);
});