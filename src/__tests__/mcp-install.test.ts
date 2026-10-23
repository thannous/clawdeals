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

// Note: when Node's stdout is a pipe, `console.log()` can be dropped at process exit.
// Redirecting to real file descriptors makes output deterministic for assertions.
// Spawning node directly (no bash) keeps Windows paths intact.
function runNodeScriptToFiles({
  repoRoot,
  scriptArgs,
  ioDir,
  env = {}
}: {
  repoRoot: string;
  scriptArgs: string[];
  ioDir: string;
  env?: Record<string, string | undefined>;
}) {
  const installScript = path.join(repoRoot, "scripts", "mcp", "install.mjs");
  const outPath = path.join(ioDir, "stdout.txt");
  const errPath = path.join(ioDir, "stderr.txt");
  const outFd = fs.openSync(outPath, "w");
  const errFd = fs.openSync(errPath, "w");

  try {
    const res = spawnSync(process.execPath, [installScript, ...scriptArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: path.join(ioDir, "home"),
        USERPROFILE: path.join(ioDir, "home"),
        // Required by the installer.
        CLAWDEALS_API_KEY: "test_api_key",
        CLAWDEALS_API_BASE: "https://app.clawdeals.com/api",
        ...env
      },
      stdio: ["ignore", outFd, errFd],
      encoding: "utf8"
    });

    return {
      code: res.status ?? -1,
      stdout: existsTextFile(outPath),
      stderr: existsTextFile(errPath)
    };
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
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
  return runNodeScriptToFiles({ repoRoot, scriptArgs: ["--file", filePath, ...extraArgs], ioDir, env });
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
  return runNodeScriptToFiles({ repoRoot, scriptArgs: args, ioDir, env });
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

    const backupPath = res.stdout.match(/mcp:install: Backup (.+)/)?.[1]?.trim();
    expect(backupPath).toBeTruthy();
    expect(fs.readFileSync(backupPath!, "utf8")).toBe("");
    expect(fs.readdirSync(dir).some((f) => f.startsWith("mcp.json.bak-"))).toBe(false);
  });

  it.each([".mcp.json", "nested/custom.jsonc", "nested/config.toml"])(
    "keeps restorable backups private during repeated installs into %s",
    (name) => {
      const repoRoot = repoRootFromImportMetaUrl(import.meta.url);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-backup-"));
      const project = path.join(dir, "project");
      const filePath = path.join(project, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const fakeKey = ["cd_live_", "a-b_cDef", ".", "s".repeat(42), "_"].join("");
      const original = name.endsWith(".toml")
        ? `[mcp_servers.other]\ncommand = "other"\nenv = { CLAWDEALS_API_KEY = "${fakeKey}" }\n`
        : `\uFEFF// keep the existing server\n{"mcpServers":{"other":{"command":"other","env":{"CLAWDEALS_API_KEY":"${fakeKey}"}}}}\n`;
      fs.writeFileSync(filePath, original);
      const args = name.endsWith(".toml")
        ? ["--client", "codex", "--codex-file", filePath]
        : ["--file", filePath];
      const run = (extra: string[] = []) => runInstallerRaw({ repoRoot, ioDir: dir, args: [...args, ...extra] });
      const dryRun = run(["--dry-run"]);
      expect(dryRun.code).toBe(0);
      expect(fs.readFileSync(filePath, "utf8")).toBe(original);
      expect(fs.existsSync(path.join(dir, "home", ".clawdeals"))).toBe(false);

      const first = run();
      expect(first.code).toBe(0);
      const backup = first.stdout.match(/mcp:install: Backup (.+)/)?.[1]?.trim();
      expect(backup).toBeTruthy();
      expect(path.relative(path.join(dir, "home", ".clawdeals", "mcp-backups"), backup!).startsWith("..")).toBe(false);
      expect(fs.readFileSync(backup!, "utf8")).toBe(original);
      expect(fs.readdirSync(path.dirname(filePath))).toEqual([path.basename(filePath)]);
      const installed = fs.readFileSync(filePath, "utf8");
      expect(installed).toContain("test_api_key");
      expect(installed).toContain("other");
      expect(installed).toContain(fakeKey);
      expect(first.stdout + first.stderr).not.toContain(fakeKey);
      if (process.platform !== "win32") {
        expect(fs.statSync(backup!).mode & 0o777).toBe(0o600);
        expect(fs.statSync(path.dirname(backup!)).mode & 0o777).toBe(0o700);
      }

      const second = run();
      expect(second.code).toBe(0);
      const nextBackup = second.stdout.match(/mcp:install: Backup (.+)/)?.[1]?.trim();
      expect(nextBackup).toBeTruthy();
      expect(nextBackup).not.toBe(backup);
      expect(fs.readFileSync(nextBackup!, "utf8")).toBe(installed);
      expect(fs.readFileSync(backup!, "utf8")).toBe(original);

      // Even a home directory tracked by Git must not add the new backup.
      const gitEnv = { ...process.env };
      for (const key of Object.keys(gitEnv)) if (key.startsWith("GIT_")) delete gitEnv[key];
      const git = (gitArgs: string[]) => spawnSync("git", gitArgs, { cwd: dir, env: gitEnv, encoding: "utf8" });
      expect(git(["init", "--quiet"]).status).toBe(0);
      expect(git(["check-ignore", "-q", "--", backup!]).status).toBe(0);
      expect(git(["add", "--", backup!]).status).not.toBe(0);
    }
  );

  it("leaves the original config intact when private backup storage cannot be created", () => {
    const repoRoot = repoRootFromImportMetaUrl(import.meta.url);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-mcp-backup-failure-"));
    const filePath = path.join(dir, ".mcp.json");
    const original = '{"mcpServers":{"other":{"command":"other"}}}\n';
    fs.writeFileSync(filePath, original);
    fs.mkdirSync(path.join(dir, "home"));
    fs.writeFileSync(path.join(dir, "home", ".clawdeals"), "not a directory");
    const result = runInstaller({ repoRoot, ioDir: dir, filePath });
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("Updated");
    expect(fs.readFileSync(filePath, "utf8")).toBe(original);
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
