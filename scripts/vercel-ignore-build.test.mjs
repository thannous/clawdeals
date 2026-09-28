import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Browser tests cannot exercise Vercel's Git build decision. Real disposable Git
// repositories cover lost web updates, public assets, renames, missing
// history, multi-commit pushes and documentation-only skips before deployment.
const script = fileURLToPath(
  new URL("./vercel-ignore-build.mjs", import.meta.url),
);
const cases = [
  ["internal documentation", "docs/operations.md", 0],
  ["code in docs", "docs/tool.ts", 1],
  ["agent guidance", "AGENTS.md", 0],
  ["web page", "src/pages/index.tsx", 1],
  ["public documentation", "public/help.md", 1],
  ["dependencies", "package-lock.json", 1],
  ["migration", "supabase/migrations/new.sql", 1],
  ["build script", "scripts/build.mjs", 1],
  ["unknown input", "new-build-input.json", 1],
];
for (const [label, file, expected] of cases) {
  test(label, () => {
    const root = mkdtempSync(join(tmpdir(), "clawdeals-build-filter-"));
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    try {
      git("init", "-q");
      git("config", "user.email", "fixture@example.invalid");
      git("config", "user.name", "Disposable fixture");
      git("commit", "--allow-empty", "-qm", "base");
      const base = git("rev-parse", "HEAD");
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "fixture\n");
      git("add", ".");
      git("commit", "-qm", label);
      const run = (previous = base) =>
        spawnSync(process.execPath, [script], {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous },
        });
      const result = run();
      assert.equal(result.status, expected, result.stdout + result.stderr);
      assert.match(result.stdout, expected ? /BUILD:/ : /SKIP:/);
      assert.equal(run("").status, 1, "first deployment must build");
      assert.equal(run("f".repeat(40)).status, 1, "missing history must build");
      if (label === "web page") {
        mkdirSync(join(root, "docs"), { recursive: true });
        writeFileSync(join(root, "docs/after.md"), "docs\n");
        git("add", ".");
        git("commit", "-qm", "docs after web change");
        assert.equal(
          run().status,
          1,
          "compare all commits since last deployment",
        );
        const previous = git("rev-parse", "HEAD");
        git("mv", file, "docs/moved.md");
        git("commit", "-qm", "move web file");
        assert.equal(
          run(previous).status,
          1,
          "web deletion in rename must build",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
