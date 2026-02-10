import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildClawdealsServerConfig,
  ensureObject,
  formatJson,
  parseJsonLike,
  resolveRepoServerPath,
  upsertServer
} from "./install-lib.mjs";

function fail(message) {
  console.error(`mcp:install: ${message}`);
  process.exit(1);
}

function existsFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function writeUtf8(p, content) {
  fs.writeFileSync(p, content, "utf8");
}

function backupIfExists(filePath) {
  if (!existsFile(filePath)) return null;
  const backupPath = `${filePath}.bak-${nowStamp()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function detectCursorConfigPath() {
  const home = os.homedir();
  const cursorDir = path.join(home, ".cursor");
  if (!existsDir(cursorDir)) return null;

  const json = path.join(cursorDir, "mcp.json");
  const jsonc = path.join(cursorDir, "mcp.jsonc");
  if (existsFile(json)) return { filePath: json, defaultKey: "servers" };
  if (existsFile(jsonc)) return { filePath: jsonc, defaultKey: "servers" };

  // Cursor directory exists but config doesn't; create mcp.json.
  return { filePath: json, defaultKey: "servers" };
}

function detectClaudeDesktopConfigPath() {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }

  // Linux / others
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, "Claude", "claude_desktop_config.json");
}

function chooseKeyName(parsed, defaultKey) {
  const root = ensureObject(parsed);
  if (root.mcpServers && typeof root.mcpServers === "object") return "mcpServers";
  if (root.servers && typeof root.servers === "object") return "servers";
  return defaultKey;
}

function loadOrInitConfig(filePath, defaultKey) {
  if (!existsFile(filePath)) return { [defaultKey]: {} };

  const raw = readUtf8(filePath);
  const parsed = parseJsonLike(raw);
  if (!parsed || typeof parsed !== "object") return { [defaultKey]: {} };
  return parsed;
}

function installIntoFile({ filePath, defaultKey, serverName, serverConfig, dryRun }) {
  let parsed;
  try {
    parsed = loadOrInitConfig(filePath, defaultKey);
  } catch (err) {
    console.error(`mcp:install: Skipping (unparseable JSON/JSONC): ${filePath}`);
    console.error(`mcp:install: ${String(err?.message || err)}`);
    return { ok: false, skipped: true, filePath, reason: "unparseable" };
  }

  const keyName = chooseKeyName(parsed, defaultKey);
  const next = upsertServer({ config: parsed, keyName, serverName, serverConfig });

  if (dryRun) {
    console.log(`mcp:install: (dry-run) would write ${filePath}`);
    return { ok: true, filePath, keyName, backupPath: null, wrote: false };
  }

  const dir = path.dirname(filePath);
  if (!existsDir(dir)) mkdirp(dir);

  const backupPath = backupIfExists(filePath);
  writeUtf8(filePath, formatJson(next));
  return { ok: true, filePath, keyName, backupPath, wrote: true };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fileArgIdx = argv.findIndex((a) => a === "--file" || a === "--path");
  const explicitFile = fileArgIdx >= 0 ? argv[fileArgIdx + 1] : null;
  if (fileArgIdx >= 0 && !explicitFile) {
    fail("Missing value for --file (expected a path to a config file)");
  }

  const apiKey = String(process.env.CLAWDEALS_API_KEY || "").trim();
  if (!apiKey) fail("CLAWDEALS_API_KEY is required");

  const apiBase = String(process.env.CLAWDEALS_API_BASE || "http://localhost:3000/api").trim();
  const origin = String(process.env.CLAWDEALS_ORIGIN || "mcp").trim();
  const timeoutMs = String(process.env.CLAWDEALS_TIMEOUT_MS || "15000").trim();

  const serverPath = resolveRepoServerPath({ installScriptUrl: import.meta.url });
  if (!existsFile(serverPath)) fail(`Missing server script: ${serverPath}`);

  const serverConfig = buildClawdealsServerConfig({
    serverPath,
    apiKey,
    apiBase,
    origin,
    timeoutMs
  });

  const targets = [];

  if (explicitFile) {
    targets.push({ kind: "explicit", filePath: path.resolve(explicitFile), defaultKey: "servers" });
  } else {
    const cursor = detectCursorConfigPath();
    if (cursor) targets.push({ kind: "cursor", ...cursor });

    const claudePath = detectClaudeDesktopConfigPath();
    if (claudePath && existsFile(claudePath)) {
      targets.push({ kind: "claude-desktop", filePath: claudePath, defaultKey: "mcpServers" });
    }
  }

  if (!targets.length) {
    console.log("mcp:install: No supported MCP config file found.");
    console.log("mcp:install: Supported: Cursor (~/.cursor/mcp.json) and Claude Desktop (claude_desktop_config.json).");
    console.log("");
    console.log("Manual config (Cursor-style):");
    console.log(
      formatJson({
        servers: {
          clawdeals: serverConfig
        }
      }).trimEnd()
    );
    process.exit(2);
  }

  const results = targets.map((t) =>
    installIntoFile({
      filePath: t.filePath,
      defaultKey: t.defaultKey,
      serverName: "clawdeals",
      serverConfig,
      dryRun
    })
  );

  const wrote = results.filter((r) => r.ok && r.wrote);
  const skipped = results.filter((r) => !r.ok && r.skipped);

  for (const r of wrote) {
    console.log(`mcp:install: Updated ${r.filePath} (${r.keyName}.clawdeals)`);
    if (r.backupPath) console.log(`mcp:install: Backup ${r.backupPath}`);
  }
  for (const r of skipped) {
    console.log(`mcp:install: Skipped ${r.filePath} (${r.reason})`);
  }

  console.log("");
  console.log("mcp:install: Next steps:");
  console.log("mcp:install: 1) Restart your IDE so it reloads MCP servers.");
  console.log('mcp:install: 2) In your IDE, call "clawdeals.deals.list" with { "limit": 1 }.');
}

main().catch((err) => fail(String(err?.stack || err?.message || err)));
