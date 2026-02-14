import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildClawdealsServerConfig,
  buildClawdealsNpxServerConfig,
  ensureObject,
  formatJson,
  parseJsonLike,
  upsertServer
} from "./install-lib.mjs";

export const DEFAULT_API_BASE = "https://app.clawdeals.com/api";

function fail(message) {
  console.error(`mcp:install: ${message}`);
  process.exit(1);
}

export function existsFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}

export function existsDir(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export function mkdirp(p) {
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

export function detectCursorConfigPath() {
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

export function detectClaudeDesktopConfigPath() {
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

export function detectClaudeCodeConfigPath() {
  return path.resolve(process.cwd(), ".mcp.json");
}

export function detectCodexConfigPath() {
  const home = os.homedir();
  return path.join(home, ".codex", "config.toml");
}

export function defaultWindsurfConfigPath() {
  const home = os.homedir();
  return path.join(home, ".codeium", "windsurf", "mcp_config.json");
}

export function detectWindsurfConfigPath() {
  const home = os.homedir();
  const candidates = [defaultWindsurfConfigPath(), path.join(home, ".codeium", "mcp_config.json")];

  for (const candidate of candidates) {
    if (existsFile(candidate)) return { filePath: candidate, defaultKey: "mcpServers" };
  }

  if (existsDir(path.join(home, ".codeium", "windsurf")) || existsDir(path.join(home, ".codeium"))) {
    return { filePath: defaultWindsurfConfigPath(), defaultKey: "mcpServers" };
  }

  return null;
}

export function defaultGeminiConfigPath() {
  const home = os.homedir();
  return path.join(home, ".gemini", "settings.json");
}

export function detectGeminiConfigPath() {
  const filePath = defaultGeminiConfigPath();
  if (existsFile(filePath)) return { filePath, defaultKey: "mcpServers" };
  if (existsDir(path.dirname(filePath))) return { filePath, defaultKey: "mcpServers" };
  return null;
}

export function parseArgValue(argv, keys) {
  const idx = argv.findIndex((a) => keys.includes(a));
  if (idx < 0) return { present: false, value: null };
  return { present: true, value: argv[idx + 1] || null };
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toTomlArray(values) {
  return `[${values.map((v) => `"${escapeTomlString(v)}"`).join(", ")}]`;
}

function renderCodexServerBlock({ serverName, serverConfig }) {
  const args = Array.isArray(serverConfig?.args) ? serverConfig.args.map((a) => String(a)) : [];
  const envObj = serverConfig?.env && typeof serverConfig.env === "object" ? serverConfig.env : {};
  const envPairs = Object.entries(envObj).map(([k, v]) => `${k} = "${escapeTomlString(String(v))}"`);

  return [
    `[mcp_servers.${serverName}]`,
    `command = "${escapeTomlString(String(serverConfig?.command || "npx"))}"`,
    `args = ${toTomlArray(args)}`,
    `env = { ${envPairs.join(", ")} }`
  ].join("\n");
}

function upsertCodexTomlServer({ existingToml, serverName, serverConfig }) {
  const block = renderCodexServerBlock({ serverName, serverConfig });
  const content = String(existingToml || "");
  const headerRe = new RegExp(`^\\[mcp_servers\\.${serverName}\\]\\s*$`, "m");
  const headerMatch = headerRe.exec(content);
  if (!headerMatch) {
    const sep = content.trimEnd().length > 0 ? "\n\n" : "";
    return `${content.trimEnd()}${sep}${block}\n`;
  }

  const start = headerMatch.index;
  const afterHeader = start + headerMatch[0].length;
  const rest = content.slice(afterHeader);
  const nextSectionRe = /^\[[^\]]+\]\s*$/m;
  const nextMatch = nextSectionRe.exec(rest);
  const end = nextMatch ? afterHeader + nextMatch.index : content.length;
  const before = content.slice(0, start).trimEnd();
  const after = content.slice(end).trimStart();
  const merged = `${before}${before ? "\n\n" : ""}${block}${after ? `\n\n${after}` : "\n"}`;
  return merged;
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
  // Treat an existing-but-empty file as "no config yet" so onboarding works.
  // parseJsonLike("") throws, which would otherwise cause a misleading "skip".
  const cleaned = String(raw || "").replace(/^\uFEFF/, "");
  if (!cleaned.trim()) return { [defaultKey]: {} };

  const parsed = parseJsonLike(cleaned);
  if (!parsed || typeof parsed !== "object") return { [defaultKey]: {} };
  return parsed;
}

export function installIntoFile({ filePath, defaultKey, serverName, serverConfig, dryRun, logger = console }) {
  let parsed;
  try {
    parsed = loadOrInitConfig(filePath, defaultKey);
  } catch (err) {
    logger?.error?.(`mcp:install: Skipping (unparseable JSON/JSONC): ${filePath}`);
    logger?.error?.(`mcp:install: ${String(err?.message || err)}`);
    return { ok: false, skipped: true, filePath, reason: "unparseable" };
  }

  const keyName = chooseKeyName(parsed, defaultKey);
  const next = upsertServer({ config: parsed, keyName, serverName, serverConfig });

  if (dryRun) {
    logger?.log?.(`mcp:install: (dry-run) would write ${filePath}`);
    return { ok: true, filePath, keyName, backupPath: null, wrote: false };
  }

  const dir = path.dirname(filePath);
  if (!existsDir(dir)) mkdirp(dir);

  const backupPath = backupIfExists(filePath);
  writeUtf8(filePath, formatJson(next));
  return { ok: true, filePath, keyName, backupPath, wrote: true };
}

export function installIntoCodexFile({ filePath, serverName, serverConfig, dryRun, logger = console }) {
  let existing = "";
  try {
    existing = existsFile(filePath) ? readUtf8(filePath) : "";
  } catch (err) {
    logger?.error?.(`mcp:install: Skipping (cannot read TOML): ${filePath}`);
    logger?.error?.(`mcp:install: ${String(err?.message || err)}`);
    return { ok: false, skipped: true, filePath, reason: "unreadable" };
  }

  const next = upsertCodexTomlServer({ existingToml: existing, serverName, serverConfig });

  if (dryRun) {
    logger?.log?.(`mcp:install: (dry-run) would write ${filePath}`);
    return { ok: true, filePath, keyName: "mcp_servers", backupPath: null, wrote: false };
  }

  const dir = path.dirname(filePath);
  if (!existsDir(dir)) mkdirp(dir);
  const backupPath = backupIfExists(filePath);
  writeUtf8(filePath, next);
  return { ok: true, filePath, keyName: "mcp_servers", backupPath, wrote: true };
}

async function askClientTarget() {
  if (!input.isTTY || !output.isTTY) return null;
  const rl = readline.createInterface({ input, output });
  try {
    console.log("mcp:install: No MCP config file auto-detected.");
    console.log("mcp:install: Choose target client:");
    console.log("  1) Cursor (~/.cursor/mcp.json)");
    console.log("  2) Claude Desktop (claude_desktop_config.json)");
    console.log("  3) Claude Code (./.mcp.json)");
    console.log("  4) Codex (~/.codex/config.toml)");
    console.log("  5) Windsurf (~/.codeium/windsurf/mcp_config.json)");
    console.log("  6) Gemini CLI (~/.gemini/settings.json)");
    console.log("  7) Custom JSON/JSONC file path");
    const answer = String(await rl.question("Choice [1-7] (blank=cancel): ")).trim();
    if (!answer) return null;
    if (answer === "1") {
      const cursor = detectCursorConfigPath();
      return { kind: "cursor", filePath: (cursor?.filePath || path.join(os.homedir(), ".cursor", "mcp.json")), defaultKey: "servers" };
    }
    if (answer === "2") {
      const p = detectClaudeDesktopConfigPath();
      if (!p) return null;
      return { kind: "claude-desktop", filePath: p, defaultKey: "mcpServers" };
    }
    if (answer === "3") {
      return { kind: "claude-code", filePath: detectClaudeCodeConfigPath(), defaultKey: "mcpServers" };
    }
    if (answer === "4") {
      return { kind: "codex", filePath: detectCodexConfigPath() };
    }
    if (answer === "5") {
      const windsurf = detectWindsurfConfigPath();
      return {
        kind: "windsurf",
        filePath: windsurf?.filePath || defaultWindsurfConfigPath(),
        defaultKey: "mcpServers"
      };
    }
    if (answer === "6") {
      const gemini = detectGeminiConfigPath();
      return {
        kind: "gemini",
        filePath: gemini?.filePath || defaultGeminiConfigPath(),
        defaultKey: "mcpServers"
      };
    }
    if (answer === "7") {
      const p = String(await rl.question("JSON/JSONC config file path: ")).trim();
      if (!p) return null;
      return { kind: "explicit", filePath: path.resolve(p), defaultKey: "servers" };
    }
    return null;
  } finally {
    rl.close();
  }
}

export function resolveInstallTargets({
  explicitFile,
  client,
  codexFile,
  claudeCodeFile,
  windsurfFile,
  geminiFile
}) {
  const targets = [];
  const normalizedClient = String(client || "").trim().toLowerCase();

  if (explicitFile) {
    targets.push({ kind: "explicit", filePath: path.resolve(explicitFile), defaultKey: "servers" });
    return targets;
  }

  if (normalizedClient) {
    if (normalizedClient === "cursor") {
      const cursor = detectCursorConfigPath();
      targets.push({
        kind: "cursor",
        filePath: cursor?.filePath || path.join(os.homedir(), ".cursor", "mcp.json"),
        defaultKey: "servers"
      });
      return targets;
    }
    if (normalizedClient === "claude-desktop") {
      const p = detectClaudeDesktopConfigPath();
      if (!p) throw new Error("Cannot resolve Claude Desktop config path on this platform.");
      targets.push({ kind: "claude-desktop", filePath: p, defaultKey: "mcpServers" });
      return targets;
    }
    if (normalizedClient === "claude-code") {
      const p = path.resolve(String(claudeCodeFile || detectClaudeCodeConfigPath()));
      targets.push({ kind: "claude-code", filePath: p, defaultKey: "mcpServers" });
      return targets;
    }
    if (normalizedClient === "codex") {
      const p = path.resolve(String(codexFile || detectCodexConfigPath()));
      targets.push({ kind: "codex", filePath: p });
      return targets;
    }
    if (normalizedClient === "windsurf") {
      const detected = detectWindsurfConfigPath();
      const p = path.resolve(String(windsurfFile || detected?.filePath || defaultWindsurfConfigPath()));
      targets.push({ kind: "windsurf", filePath: p, defaultKey: "mcpServers" });
      return targets;
    }
    if (normalizedClient === "gemini") {
      const detected = detectGeminiConfigPath();
      const p = path.resolve(String(geminiFile || detected?.filePath || defaultGeminiConfigPath()));
      targets.push({ kind: "gemini", filePath: p, defaultKey: "mcpServers" });
      return targets;
    }

    throw new Error(
      `Unsupported --client value: ${normalizedClient} (expected: cursor|claude-desktop|claude-code|codex|windsurf|gemini)`
    );
  }

  const cursor = detectCursorConfigPath();
  if (cursor) targets.push({ kind: "cursor", ...cursor });

  const claudePath = detectClaudeDesktopConfigPath();
  if (claudePath && existsFile(claudePath)) {
    targets.push({ kind: "claude-desktop", filePath: claudePath, defaultKey: "mcpServers" });
  }

  const windsurf = detectWindsurfConfigPath();
  if (windsurf) targets.push({ kind: "windsurf", ...windsurf });

  const gemini = detectGeminiConfigPath();
  if (gemini) targets.push({ kind: "gemini", ...gemini });

  return targets;
}

export function installIntoTargets({ targets, serverName, serverConfig, dryRun, logger = console }) {
  return targets.map((t) => {
    if (t.kind === "codex") {
      return installIntoCodexFile({
        filePath: t.filePath,
        serverName,
        serverConfig,
        dryRun,
        logger
      });
    }
    return installIntoFile({
      filePath: t.filePath,
      defaultKey: t.defaultKey,
      serverName,
      serverConfig,
      dryRun,
      logger
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const local = argv.includes("--local") || argv.includes("--repo");
  const fileArg = parseArgValue(argv, ["--file", "--path"]);
  const explicitFile = fileArg.value;
  if (fileArg.present && !explicitFile) {
    fail("Missing value for --file (expected a path to a config file)");
  }

  const serverPathIdx = argv.findIndex((a) => a === "--server-path");
  const explicitServerPath = serverPathIdx >= 0 ? argv[serverPathIdx + 1] : null;
  if (serverPathIdx >= 0 && !explicitServerPath) {
    fail("Missing value for --server-path (expected an absolute path to a local mcp-server.mjs)");
  }

  const packageArg = parseArgValue(argv, ["--package"]);
  const packageName = packageArg.present ? packageArg.value : "clawdeals-mcp";
  if (packageArg.present && !packageName) {
    fail("Missing value for --package (expected an npm package name)");
  }
  const clientArg = parseArgValue(argv, ["--client"]);
  const client = clientArg.present ? String(clientArg.value || "").trim().toLowerCase() : "";
  if (clientArg.present && !client) {
    fail("Missing value for --client (expected: cursor|claude-desktop|claude-code|codex|windsurf|gemini)");
  }
  const codexFileArg = parseArgValue(argv, ["--codex-file"]);
  if (codexFileArg.present && !codexFileArg.value) {
    fail("Missing value for --codex-file (expected a path to config.toml)");
  }
  const claudeCodeFileArg = parseArgValue(argv, ["--claude-code-file"]);
  if (claudeCodeFileArg.present && !claudeCodeFileArg.value) {
    fail("Missing value for --claude-code-file (expected a path to .mcp.json)");
  }
  const windsurfFileArg = parseArgValue(argv, ["--windsurf-file"]);
  if (windsurfFileArg.present && !windsurfFileArg.value) {
    fail("Missing value for --windsurf-file (expected a path to mcp_config.json)");
  }
  const geminiFileArg = parseArgValue(argv, ["--gemini-file"]);
  if (geminiFileArg.present && !geminiFileArg.value) {
    fail("Missing value for --gemini-file (expected a path to settings.json)");
  }

  const apiKey = String(process.env.CLAWDEALS_API_KEY || "").trim();
  if (!apiKey) fail("CLAWDEALS_API_KEY is required");

  const apiBase = String(process.env.CLAWDEALS_API_BASE || "").trim() || DEFAULT_API_BASE;
  const origin = String(process.env.CLAWDEALS_ORIGIN || "mcp").trim();
  const timeoutMs = String(process.env.CLAWDEALS_TIMEOUT_MS || "15000").trim();

  const serverConfig = local
    ? (() => {
        const raw = String(explicitServerPath || process.env.CLAWDEALS_MCP_SERVER_PATH || "").trim();
        if (!raw) {
          fail("Missing --server-path (or env CLAWDEALS_MCP_SERVER_PATH) for --local installs");
        }
        const serverPath = path.resolve(raw);
        if (!existsFile(serverPath)) fail(`Missing server script: ${serverPath}`);
        return buildClawdealsServerConfig({ serverPath, apiKey, apiBase, origin, timeoutMs });
      })()
    : buildClawdealsNpxServerConfig({ packageName, apiKey, apiBase, origin, timeoutMs });

  let targets = [];
  try {
    targets = resolveInstallTargets({
      explicitFile,
      client,
      codexFile: codexFileArg.value,
      claudeCodeFile: claudeCodeFileArg.value,
      windsurfFile: windsurfFileArg.value,
      geminiFile: geminiFileArg.value
    });
  } catch (error) {
    fail(String(error?.message || error));
  }

  if (!targets.length) {
    const selected = await askClientTarget();
    if (selected) {
      targets.push(selected);
    } else {
      console.log("mcp:install: No supported MCP config file found.");
      console.log("mcp:install: Auto-detect supports Cursor, Claude Desktop, Windsurf, and Gemini CLI.");
      console.log("mcp:install: Tip: run with --client codex|claude-code|cursor|claude-desktop|windsurf|gemini");
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
  }

  const results = installIntoTargets({ targets, serverName: "clawdeals", serverConfig, dryRun });

  const ok = results.filter((r) => r.ok);
  const wrote = results.filter((r) => r.ok && r.wrote);
  const skipped = results.filter((r) => !r.ok && r.skipped);

  for (const r of wrote) {
    console.log(`mcp:install: Updated ${r.filePath} (${r.keyName}.clawdeals)`);
    if (r.backupPath) console.log(`mcp:install: Backup ${r.backupPath}`);
  }
  for (const r of skipped) {
    console.log(`mcp:install: Skipped ${r.filePath} (${r.reason})`);
  }

  if (!ok.length) {
    console.error("mcp:install: No files were updated. All targets were skipped.");
    process.exit(1);
  }
  if (!dryRun && wrote.length === 0) {
    console.error("mcp:install: No files were updated.");
    process.exit(1);
  }

  console.log("");
  if (skipped.length) {
    console.log(`mcp:install: Warning: ${skipped.length} target file(s) were skipped (see above).`);
    console.log("");
  }

  if (dryRun ? ok.length : wrote.length) {
    console.log(dryRun ? "mcp:install: Next steps (after running without --dry-run):" : "mcp:install: Next steps:");
    console.log("mcp:install: 1) Restart your IDE so it reloads MCP servers.");
    console.log('mcp:install: 2) In your IDE, call "clawdeals.deals.list" with { "limit": 1 }.');
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => fail(String(err?.stack || err?.message || err)));
}
