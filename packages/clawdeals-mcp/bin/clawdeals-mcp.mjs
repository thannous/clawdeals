#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const cmd = argv[0];

function printHelp() {
  process.stdout.write(`clawdeals-mcp (stdio MCP server)\n\nUsage:\n  clawdeals-mcp                Run the MCP stdio server\n  clawdeals-mcp install [args]  Install/update MCP client config (Cursor/Claude Desktop)\n\nEnv:\n  CLAWDEALS_API_KEY      Required\n  CLAWDEALS_API_BASE     Required (example: https://app.clawdeals.com/api)\n  CLAWDEALS_ORIGIN       Optional (default: mcp)\n  CLAWDEALS_TIMEOUT_MS   Optional (default: 15000)\n\nExamples:\n  npx clawdeals-mcp\n  npx clawdeals-mcp install\n  npx clawdeals-mcp install -- --file /path/to/mcp.json\n`);
}

function printVersion() {
  // Keep in sync with package.json; used primarily for debugging.
  process.stdout.write("0.1.1\n");
}

if (cmd === "-h" || cmd === "--help") {
  printHelp();
  process.exit(0);
}

if (cmd === "-v" || cmd === "--version") {
  printVersion();
  process.exit(0);
}

function runNode(scriptRelPath, args) {
  const scriptAbsPath = path.resolve(pkgRoot, scriptRelPath);
  const result = spawnSync(process.execPath, [scriptAbsPath, ...args], {
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    process.stderr.write(`${String(result.error?.stack || result.error)}\n`);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

if (cmd === "install") {
  // Forward remaining args to the installer.
  // Note: allow "--" passthrough from npm/npx callers.
  const passthrough = argv.slice(1).filter((a) => a !== "--");
  runNode("mcp/install.mjs", passthrough);
}

if (cmd && cmd !== "stdio") {
  process.stderr.write(`Unknown command: ${cmd}\n\n`);
  printHelp();
  process.exit(1);
}

// Default: run the stdio server.
runNode("mcp-server.mjs", cmd === "stdio" ? argv.slice(1) : argv);
