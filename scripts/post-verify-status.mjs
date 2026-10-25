#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Opt-in wrapper around `npm run verify:pr` that can post the result as a
// GitHub commit status (context `verify-local/pr`) on the exact commit that
// was verified. It lives outside scripts/verify-local.mjs on purpose: the
// engine stays byte-identical to the shared copy and its sha256 is pinned as
// ENGINE_SHA256 in verify-local.config.json.
//
//   npm run verify:pr:status                  verify HEAD, never post
//   npm run verify:pr:status -- --post-status verify HEAD, then post
//
// Other options (--force, --keep, --external ...) go to verify:pr unchanged.
// --rev is refused: the wrapper always verifies HEAD, pinned to its SHA.
// A status is posted only when the working tree was clean before and after
// the run and HEAD did not move. A success also needs the engine's
// proof-block to name that SHA and its tree. Exit code: the one of verify:pr,
// or 1 when --post-status was asked and no status could be posted.

export const REPO = "thannous/clawdeals";
export const CONTEXT = "verify-local/pr";
const PREFIX = "[verify-status]";
const ENGINE = "scripts/verify-local.mjs";

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { postStatus: false, passthrough: [] };
  for (const arg of argv) {
    if (arg === "--post-status") options.postStatus = true;
    else if (arg === "--rev" || arg.startsWith("--rev=")) {
      throw new UsageError("--rev is not supported: the wrapper verifies HEAD only.");
    } else options.passthrough.push(arg);
  }
  return options;
}

function defaultExec(command, args, { cwd, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? String(result.error.message) : ""),
  };
}

function git(exec, cwd, args) {
  const result = exec("git", args, { cwd });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** HEAD, its tree and whether the working tree has any change (untracked included). */
export function readState(exec, cwd) {
  return {
    head: git(exec, cwd, ["rev-parse", "--verify", "HEAD^{commit}"]),
    tree: git(exec, cwd, ["rev-parse", "HEAD^{tree}"]),
    dirty: git(exec, cwd, ["status", "--porcelain"]) !== "",
  };
}

/** The commit SHA and tree named by the engine's proof-block output. */
export function parseProofBlock(text) {
  const sha = /^- Commit SHA: `([0-9a-f]{40})`$/m.exec(text)?.[1] ?? null;
  const tree = /^- Tree \(.*\): `([0-9a-f]{40})`$/m.exec(text)?.[1] ?? null;
  return { sha, tree };
}

export function describeResult(code, tree) {
  if (code === 0) return { state: "success", description: `verify:pr passed on tree ${tree.slice(0, 12)}` };
  if (code === 2) return { state: "failure", description: "verify:pr incomplete: a specialised check could not run" };
  return { state: "failure", description: `verify:pr failed (exit ${code})` };
}

export function main(argv = process.argv.slice(2), {
  exec = defaultExec,
  cwd = process.cwd(),
  log = (line) => console.log(line),
  error = (line) => console.error(line),
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (caught) {
    if (caught instanceof UsageError) {
      error(`${PREFIX} ${caught.message}`);
      return 64;
    }
    throw caught;
  }
  const before = readState(exec, cwd);
  if (options.postStatus && before.dirty) {
    error(`${PREFIX} status not posted: the working tree has uncommitted changes. Commit or stash them, then rerun.`);
    return 1;
  }

  const verify = exec("npm", ["run", "verify:pr", "--", "--rev", before.head, ...options.passthrough], { cwd, inherit: true });
  const code = verify.status;
  if (!options.postStatus) {
    log(`${PREFIX} no status posted (pass --post-status to post one).`);
    return code;
  }
  const refuse = (reason) => {
    error(`${PREFIX} status not posted: ${reason}`);
    return code === 0 ? 1 : code;
  };

  const after = readState(exec, cwd);
  if (after.head !== before.head) return refuse(`HEAD moved during the run (${before.head.slice(0, 12)} -> ${after.head.slice(0, 12)}).`);
  if (after.dirty) return refuse("the working tree changed during the run.");

  const result = describeResult(code, before.tree);
  if (result.state === "success") {
    const block = exec(process.execPath, [ENGINE, "proof-block", "--rev", before.head], { cwd });
    const proof = parseProofBlock(block.stdout);
    if (block.status !== 0) return refuse(`proof-block did not confirm a pass for ${before.head}.`);
    if (proof.sha !== before.head || proof.tree !== before.tree) {
      return refuse(`proof-block names ${proof.sha ?? "no SHA"} / ${proof.tree ?? "no tree"}, not ${before.head} / ${before.tree}.`);
    }
  }

  const post = exec("gh", [
    "api", "--method", "POST", `repos/${REPO}/statuses/${before.head}`,
    "-f", `state=${result.state}`,
    "-f", `context=${CONTEXT}`,
    "-f", `description=${result.description}`,
  ], { cwd });
  if (post.status !== 0) return refuse(`gh api failed: ${post.stderr.trim() || `exit ${post.status}`}`);
  log(`${PREFIX} posted ${result.state} (${CONTEXT}) on ${before.head}.`);
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
