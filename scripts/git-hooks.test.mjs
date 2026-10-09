import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { PROOF_FORMAT_VERSION, writeProof } from "./verify-local.mjs";

// Contract of the pre-push hook (common delivery rule v2, section 3) and of the
// installer that `npm ci` runs, exercised with real `git push` calls into
// disposable repositories that carry this repository's hook, engine and
// verify-local.config.mjs.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_FILES = [
  ".githooks/pre-push",
  ".gitignore",
  ".nvmrc",
  "verify-local.config.mjs",
  "scripts/verify-local.mjs",
  "scripts/install-git-hooks.mjs",
];
const KEPT_GIT_ENV = new Set(["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_CONFIG_NOSYSTEM"]);
const scratch = mkdtempSync(join(tmpdir(), "clawdeals-git-hooks-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

function environment(home, extra = {}) {
  const env = {
    ...process.env,
    HOME: home,
    GIT_AUTHOR_NAME: "Disposable fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Disposable fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_CONFIG_NOSYSTEM: "1",
    ...extra,
  };
  // A hook or a verify:pr run may export GIT_DIR and friends: never reuse them.
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_") && !KEPT_GIT_ENV.has(key)) delete env[key];
  }
  return env;
}

function copyInto(directory, files) {
  for (const file of files) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    copyFileSync(join(repoRoot, file), join(directory, file));
  }
}

/** A clone of a bare origin holding the repository's hook files on main, hook not yet installed. */
function makeRepository() {
  counter += 1;
  const base = join(scratch, `case-${counter}`);
  const origin = join(base, "origin.git");
  const work = join(base, "work");
  mkdirSync(base, { recursive: true });
  const env = environment(base);
  const run = (command, args, options = {}) =>
    spawnSync(command, args, { cwd: work, env, encoding: "utf8", ...options });
  const git = (...args) => {
    const result = run("git", args);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  run("git", ["init", "--quiet", "--bare", "--initial-branch=main", origin], { cwd: base });
  run("git", ["clone", "--quiet", origin, work], { cwd: base });
  git("checkout", "--quiet", "-b", "main");
  copyInto(work, FIXTURE_FILES);
  writeFileSync(join(work, ".env.example"), "API_KEY=\n");
  writeFileSync(join(work, "src.js"), "export const value = 1;\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "init");
  git("push", "--quiet", "origin", "main");
  const commit = (message, files, { force = false } = {}) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(work, file)), { recursive: true });
      writeFileSync(join(work, file), content);
    }
    git("add", ...(force ? ["-f"] : []), "--", ...Object.keys(files));
    git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const install = () => run(process.execPath, ["scripts/install-git-hooks.mjs"]);
  const push = (...args) => {
    const started = Date.now();
    const result = run("git", ["push", ...args]);
    return { ...result, output: `${result.stdout}${result.stderr}`, elapsed: Date.now() - started };
  };
  const remoteHas = (ref) => run("git", ["ls-remote", "--exit-code", "origin", ref]).status === 0;
  return { base, work, env, git, run, commit, install, push, remoteHas };
}

function installedRepository() {
  const repo = makeRepository();
  const installed = repo.install();
  assert.equal(installed.status, 0, installed.stderr);
  return repo;
}

test("the installer points Git at .githooks once and announces the fast checks", () => {
  const repo = makeRepository();
  const first = repo.install();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(repo.git("config", "--local", "--get", "core.hooksPath"), ".githooks");
  assert.match(first.stdout, /fast push checks/);
  assert.match(first.stdout, /npm run verify:pr/);
  assert.doesNotMatch(first.stdout, /test:ci/);
  const second = repo.install();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, "", "an installed hook is left as is, silently");
});

test("the installer never fails an install outside a checkout of this repository", () => {
  // No Git repository at all (a deployment build or an extracted archive).
  const bare = join(scratch, `no-git-${counter += 1}`);
  copyInto(bare, ["scripts/install-git-hooks.mjs"]);
  const outside = spawnSync(process.execPath, ["scripts/install-git-hooks.mjs"], {
    cwd: bare,
    env: environment(bare, { GIT_CEILING_DIRECTORIES: dirname(bare) }),
    encoding: "utf8",
  });
  assert.equal(outside.status, 0, outside.stderr);
  assert.equal(outside.stdout, "");

  // No git executable on PATH.
  const noGit = spawnSync(process.execPath, ["scripts/install-git-hooks.mjs"], {
    cwd: bare,
    env: environment(bare, { PATH: join(bare, "empty-path") }),
    encoding: "utf8",
  });
  assert.equal(noGit.status, 0, noGit.stderr);

  // A copy of the package inside another repository leaves that repository alone.
  const repo = makeRepository();
  copyInto(join(repo.work, "vendor/clawdeals"), ["scripts/install-git-hooks.mjs"]);
  const nested = repo.run(process.execPath, ["vendor/clawdeals/scripts/install-git-hooks.mjs"]);
  assert.equal(nested.status, 0, nested.stderr);
  assert.equal(repo.run("git", ["config", "--local", "--get", "core.hooksPath"]).stdout, "");
});

test("a branch deletion or a push of commits the remote has runs nothing", () => {
  const repo = installedRepository();
  repo.git("branch", "copy", "main");
  const known = repo.push("origin", "copy");
  assert.equal(known.status, 0, known.output);
  assert.match(known.output, /nothing new to send; no check run/);
  const deletion = repo.push("origin", "--delete", "copy");
  assert.equal(deletion.status, 0, deletion.output);
  assert.match(deletion.output, /nothing new to send; no check run/);
  assert.equal(repo.remoteHas("refs/heads/copy"), false);
});

test("a push takes seconds, reports a missing proof and accepts work in progress", () => {
  const repo = installedRepository();
  repo.git("checkout", "--quiet", "-b", "feature");
  repo.commit("feature", { "src.js": "export const value = 2;\n" });
  // Uncommitted and untracked changes no longer block: verify:pr checks an isolated copy.
  writeFileSync(join(repo.work, "src.js"), "export const value = 3;\n");
  writeFileSync(join(repo.work, "draft.js"), "export const draft = true;\n");
  const result = repo.push("origin", "feature");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /no proof yet; run npm run verify:pr before asking for a merge/);
  assert.match(result.output, /fast checks passed/);
  assert.doesNotMatch(result.output, /test:ci|vitest|tsc/);
  assert.ok(result.elapsed < 10_000, `the push took ${result.elapsed} ms`);

  // A branch other than HEAD is pushed and checked too.
  repo.git("stash", "--include-untracked", "--quiet");
  repo.git("checkout", "--quiet", "-b", "other", "main");
  repo.commit("other", { "other.js": "export const other = 1;\n" });
  repo.git("checkout", "--quiet", "feature");
  const other = repo.push("origin", "other");
  assert.equal(other.status, 0, other.output);
  assert.equal(repo.remoteHas("refs/heads/other"), true);
});

test("forbidden files and secrets block the push", () => {
  const repo = installedRepository();
  repo.git("checkout", "--quiet", "-b", "leak");
  repo.commit("env file", { ".env.production": "API_KEY=1\n" }, { force: true });
  const envFile = repo.push("origin", "leak");
  assert.notEqual(envFile.status, 0, envFile.output);
  assert.match(envFile.output, /\.env\.production: forbidden file/);
  assert.equal(repo.remoteHas("refs/heads/leak"), false);

  repo.git("checkout", "--quiet", "-b", "secret", "main");
  const fake = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  repo.commit("secret", { "config.js": `export const key = "${fake}";\n` });
  const secret = repo.push("origin", "secret");
  assert.notEqual(secret.status, 0, secret.output);
  assert.match(secret.output, /config\.js: looks like a AWS access key/);
  assert.equal(repo.remoteHas("refs/heads/secret"), false);
});

test("the .gitignore contract keeps local env files ignored", () => {
  const repo = installedRepository();
  repo.git("checkout", "--quiet", "-b", "ignore");
  const gitignore = readFileSync(join(repo.work, ".gitignore"), "utf8").replace(/^\.env\.\*$/m, "");
  repo.commit("stop ignoring env files", { ".gitignore": gitignore });
  const result = repo.push("origin", "ignore");
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /gitignore-env failed/);
});

test("the proof of the pushed tree is shown", () => {
  const repo = installedRepository();
  repo.git("checkout", "--quiet", "-b", "proven");
  const sha = repo.commit("proven", { "src.js": "export const value = 4;\n" });
  const tree = repo.git("rev-parse", `${sha}^{tree}`);
  const commonDir = join(repo.work, repo.git("rev-parse", "--git-common-dir"));
  const now = new Date().toISOString();
  writeProof(commonDir, {
    version: PROOF_FORMAT_VERSION,
    rule: "regle-commune-livraison v2",
    kind: "pr",
    sha,
    tree,
    clean: true,
    result: "passed",
    startedAt: now,
    finishedAt: now,
    command: "npm run verify:pr",
    node: process.version,
    packageManager: null,
    base: { ref: "origin/main", sha: null, mergeBase: null },
    targets: [],
    checks: [{ name: "unit", command: "npm run test:unit", result: "passed", durationMs: 1 }],
  });
  const result = repo.push("origin", "proven");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, new RegExp(`${sha.slice(0, 12)}: pr proof passed \\(1 run, 0 reused, 0 out of scope\\)`));
});

test("without node the hook stops with a clear message", () => {
  const repo = makeRepository();
  const result = spawnSync("/bin/sh", [".githooks/pre-push", "origin", "fixture"], {
    cwd: repo.work,
    env: { ...repo.env, PATH: join(repo.base, "empty-path") },
    input: "",
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /node is not on PATH/);
  assert.match(result.stderr, /Node 24\.19\.0/);
});
