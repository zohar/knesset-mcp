// Automated smoke test for the Knesset MCP server.
// Spawns the built server, speaks JSON-RPC over stdio, and checks the
// three canonical MCP calls: initialize, tools/list, tools/call.
//
// Run:  node test-mcp.mjs

import { spawn } from "node:child_process";
import { once } from "node:events";

const SERVER_CMD = "node";
const SERVER_ARGS = ["build/knesset-mcp-server.js"];

const child = spawn(SERVER_CMD, SERVER_ARGS, {
  stdio: ["pipe", "pipe", "pipe"],
});

child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

let buffer = "";
const pending = new Map();

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error(`[test] non-JSON line from server: ${line}`);
      continue;
    }
    const resolver = pending.get(msg.id);
    if (resolver) {
      pending.delete(msg.id);
      resolver(msg);
    }
  }
});

function send(method, params, id) {
  const payload = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify(payload) + "\n", (err) => {
      if (err) reject(err);
    });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
      }
    }, 15000);
  });
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

async function run() {
  // 1. initialize
  try {
    const res = await send(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-smoke-test", version: "0.0.1" },
      },
      1,
    );
    const ok = !!res.result && !!res.result.serverInfo;
    record("initialize", ok, ok ? res.result.serverInfo.name : JSON.stringify(res));
  } catch (e) {
    record("initialize", false, e.message);
  }

  // 2. tools/list — this is the one the issue reports as broken
  let toolNames = [];
  try {
    const res = await send("tools/list", {}, 2);
    const tools = res.result?.tools;
    const ok = Array.isArray(tools) && tools.length > 0;
    if (ok) toolNames = tools.map((t) => t.name);
    record(
      "tools/list",
      ok,
      ok ? `${tools.length} tools: ${toolNames.join(", ")}` : JSON.stringify(res),
    );
  } catch (e) {
    record("tools/list", false, e.message);
  }

  // 3. tools/call — exercise one real tool if we found one
  if (toolNames.includes("get-bill-info")) {
    try {
      const res = await send(
        "tools/call",
        { name: "get-bill-info", arguments: { billId: 2000000 } },
        3,
      );
      const ok = !!res.result && Array.isArray(res.result.content);
      record(
        "tools/call get-bill-info",
        ok,
        ok ? `content[0].type=${res.result.content[0]?.type}` : JSON.stringify(res),
      );
    } catch (e) {
      record("tools/call get-bill-info", false, e.message);
    }
  } else {
    record("tools/call get-bill-info", false, "tool not listed");
  }

  child.kill("SIGKILL");
  await once(child, "exit").catch(() => {});

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nSummary: ${results.length - failed.length}/${results.length} passed`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("Test harness error:", e);
  child.kill("SIGKILL");
  process.exit(2);
});
