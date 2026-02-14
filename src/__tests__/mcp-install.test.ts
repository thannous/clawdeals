import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function shq(s: string) {
  // Safe single-quote escaping for bash -lc strings.
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

function repoRootFromImportMetaUrl(url: string) {
  const here = path.dirname(fileURLToPath(url)); // <repo>/src/__tests__
  return path.resolve(here, "../..");
}

function runInstaller({
  repoRoot,
  filePath,
  ioDir,
  extraArgs = [],
  env = {}
}: {
  repoRoot: string;
  filePath: string;
  ioDir: string;
  extraArgs?: string[];
  env?: Record<string, string | undefined>;
}) {
  const installScript = path.join(repoRoot, "scripts", "mcp", "install.mjs");
  const outPath = path.join(ioDir, "stdout.txt");
  const errPath = path.join(ioDir, "stderr.txt");

  // Note: when Node's stdout is a pipe, `console.log()` can be dropped at process exit.
  // Redirecting to real files makes output deterministic for assertions.
  const cmd =
    `node ${shq(installScript)} --file ${shq(filePath)} ${extraArgs.map(shq).join(" ")}` +
    ` > ${shq(outPath)} 2> ${shq(errPath)}`;

  const res = spawnSync("bash", ["-lc", cmd], {
    cwd: repoRoot,
    env: {
      ...process.env,
      // Required by the installer.
      CLAWDEALS_API_KEY: "test_api_key",
      CLAWDEALS_API_BASE: "https://app.clawdeals.com/api",
      ...env
    },
    encoding: "utf8"
  });

  return {
    code: res.status ?? -1,
    stdout: existsTextFile(outPath),
    stderr: existsTextFile(errPath)
  };
}

function runInstallerRaw({
  repoRoot,
  ioDir,
  args = [],
  env = {}
}: {
  repoRoot: string;
  ioDir: string;
  args?: string[];
  env?: Record<string, string | undefined>;
}) {
  const installScript = path.join(repoRoot, "scripts", "mcp", "install.mjs");
  const outPath = path.join(ioDir, "stdout.txt");
  const errPath = path.join(ioDir, "stderr.txt");

  const cmd =
    `node ${shq(installScript)} ${args.map(shq).join(" ")}` +
    ` > ${shq(outPath)} 2> ${shq(errPath)}`;

  const res = spawnSync("bash", ["-lc", cmd], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAWDEALS_API_KEY: "test_api_key",
      CLAWDEALS_API_BASE: "https://app.clawdeals.com/api",
      ...env
    },
    encoding: "utf8"
  });

  return {
    code: res.status ?? -1,
    stdout: existsTextFile(outPath),
    stderr: existsTextFile(errPath)
  };
}

function hasScriptPty() {
  const hasBinary = spawnSync("bash", ["-lc", "command -v script >/dev/null 2>&1"], {
    encoding: "utf8"
  });
  if ((hasBinary.status ?? 1) !== 0) return false;

  // Probe actual PTY support and util-linux style flags used by this test.
  // Some restricted CI/container environments have `script` installed but
  // cannot allocate a pseudo-terminal (or do not support `-qec`), which would
  // otherwise make the interactive test fail for environmental reasons.
  const probe = spawnSync(
    "bash",
    ["-lc", "printf %s 'ok\\n' | script -qec 'cat >/dev/null' /dev/null >/dev/null 2>&1"],
    {
      encoding: "utf8",
      timeout: 5000
    }
  );
  return (probe.status ?? 1) === 0;
}

function runInstallerInteractive({
  repoRoot,
  ioDir,
  homeDir,
  choice
}: {
  repoRoot: string;
  ioDir: string;
  homeDir: string;
  choice: string;
}) {
  const installScript = path.join(repoRoot, "scripts", "mcp", "install.mjs");
  const outPath = path.join(ioDir, "stdout.txt");
  const errPath = path.join(ioDir, "stderr.txt");
  const nodeCmd = `node ${shq(installScript)} --dry-run`;

  const cmd = `printf %s ${shq(`${choice}\n`)} | script -qec ${shq(nodeCmd)} /dev/null > ${shq(outPath)} 2> ${shq(errPath)}`;

  const res = spawnSync("bash", ["-lc", cmd], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      CLAWDEALS_API_KEY: "test_api_key",
      CLAWDEALS_API_BASE: "https://app.clawdeals.com/api"
    },
    encoding: "utf8"
  });

  return {
    code: res.status ?? -1,
    stdout: existsTextFile(outPath),
    stderr: existsTextFile(errPath)
  };
}

function existsTextFile(p: string) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

describe("scripts/mcp/install.mjs regression", () => {
  it("initializes and writes config when target file exists but is empty", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-empty-"));
    const filePath = path.join(dir, "mcp.json");
    fs.writeFileSync(filePath, "", "utf8");

    const res = runInstaller({ repoRoot, filePath, ioDir: dir });

    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Updated");
    expect(res.stdout).toContain("Next steps");
    expect(res.stderr).toBe("");

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as any;
    expect(parsed?.servers?.clawdeals?.type).toBe("stdio");
    expect(parsed?.servers?.clawdeals?.command).toBe("node");
    expect(parsed?.servers?.clawdeals?.env?.CLAWDEALS_API_KEY).toBe("test_api_key");

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith("mcp.json.bak-"));
    expect(backups.length).toBe(1);
  });

  it("exits non-zero and does not claim success when target file is unparseable", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-bad-"));
    const filePath = path.join(dir, "mcp.json");
    fs.writeFileSync(filePath, "{", "utf8"); // invalid JSON/JSONC

    const res = runInstaller({ repoRoot, filePath, ioDir: dir });

    expect(res.code).toBe(1);
    expect(res.stdout).toContain("Skipped");
    expect(res.stdout).not.toContain("Next steps");
    expect(res.stderr).toContain("Skipping (unparseable JSON/JSONC)");
    expect(res.stderr).toContain("No files were updated");

    expect(fs.readFileSync(filePath, "utf8")).toBe("{");
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith("mcp.json.bak-"));
    expect(backups.length).toBe(0);
  });

  it("uses default API base when CLAWDEALS_API_BASE is not set", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-default-base-"));
    const filePath = path.join(dir, "mcp.json");
    fs.writeFileSync(filePath, "", "utf8");

    const res = runInstaller({ repoRoot, filePath, ioDir: dir, env: { CLAWDEALS_API_BASE: "" } });

    expect(res.code).toBe(0);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as any;
    expect(parsed?.servers?.clawdeals?.env?.CLAWDEALS_API_BASE).toBe("https://app.clawdeals.com/api");
  });

  it("supports --client codex and writes ~/.codex/config.toml format", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-codex-"));
    const codexFile = path.join(dir, "config.toml");
    fs.writeFileSync(codexFile, "[foo]\nbar = 1\n", "utf8");

    const res = runInstallerRaw({
      repoRoot,
      ioDir: dir,
      args: ["--client", "codex", "--codex-file", codexFile]
    });

    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("Updated");

    const toml = fs.readFileSync(codexFile, "utf8");
    expect(toml).toContain("[mcp_servers.clawdeals]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain('CLAWDEALS_API_KEY = "test_api_key"');
  });

  it("supports --client windsurf and writes mcpServers JSON config", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-windsurf-"));
    const windsurfFile = path.join(dir, "mcp_config.json");

    const res = runInstallerRaw({
      repoRoot,
      ioDir: dir,
      args: ["--client", "windsurf", "--windsurf-file", windsurfFile]
    });

    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("Updated");

    const parsed = JSON.parse(fs.readFileSync(windsurfFile, "utf8")) as any;
    expect(parsed?.mcpServers?.clawdeals?.type).toBe("stdio");
    expect(parsed?.mcpServers?.clawdeals?.command).toBe("node");
    expect(parsed?.mcpServers?.clawdeals?.env?.CLAWDEALS_API_KEY).toBe("test_api_key");
  });

  it("supports --client gemini and writes ~/.gemini/settings.json format", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-gemini-"));
    const geminiFile = path.join(dir, "settings.json");

    const res = runInstallerRaw({
      repoRoot,
      ioDir: dir,
      args: ["--client", "gemini", "--gemini-file", geminiFile]
    });

    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("Updated");

    const parsed = JSON.parse(fs.readFileSync(geminiFile, "utf8")) as any;
    expect(parsed?.mcpServers?.clawdeals?.type).toBe("stdio");
    expect(parsed?.mcpServers?.clawdeals?.command).toBe("node");
    expect(parsed?.mcpServers?.clawdeals?.env?.CLAWDEALS_API_KEY).toBe("test_api_key");
  });

  (hasScriptPty() ? it : it.skip)("supports interactive client selection (Gemini) in a TTY session", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-install-interactive-"));
    const homeDir = path.join(dir, "home");
    fs.mkdirSync(homeDir, { recursive: true });

    // Interactive menu choices:
    // 1 Cursor, 2 Claude Desktop, 3 Claude Code, 4 Codex, 5 Windsurf, 6 Gemini, 7 Custom path.
    const res = runInstallerInteractive({
      repoRoot,
      ioDir: dir,
      homeDir,
      choice: "6"
    });

    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("Choose target client");
    expect(res.stdout).toContain(".gemini/settings.json");
    expect(res.stdout).toContain("(dry-run) would write");
  });
});
