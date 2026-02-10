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
});
