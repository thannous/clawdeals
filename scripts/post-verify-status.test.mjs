import assert from "node:assert/strict";
import test from "node:test";

import { CONTEXT, REPO, main, parseProofBlock } from "./post-verify-status.mjs";

// Guards of the opt-in commit status wrapper. git, npm, the engine's
// proof-block and gh are all stubbed: no test reaches the network or GitHub.
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const TREE = "c".repeat(40);

function proofBlock(sha = SHA, tree = TREE) {
  return [
    "## Local proof",
    "- Commands: `npm run verify:pr`",
    `- Commit SHA: \`${sha}\``,
    "- Result: passed, pr proof (3 checks)",
    `- Tree (\`git rev-parse <sha>^{tree}\`): \`${tree}\``,
  ].join("\n");
}

function harness({
  dirtyBefore = false,
  dirtyAfter = false,
  headAfter = SHA,
  verifyStatus = 0,
  block = { status: 0, stdout: proofBlock() },
  ghStatus = 0,
} = {}) {
  const calls = [];
  let verified = false;
  const exec = (command, args) => {
    calls.push([command, ...args]);
    if (command === "git") {
      const key = args.join(" ");
      if (key === "rev-parse --verify HEAD^{commit}") return { status: 0, stdout: `${verified ? headAfter : SHA}\n`, stderr: "" };
      if (key === "rev-parse HEAD^{tree}") return { status: 0, stdout: `${TREE}\n`, stderr: "" };
      if (key === "status --porcelain") {
        const dirty = verified ? dirtyAfter : dirtyBefore;
        return { status: 0, stdout: dirty ? " M src/app.ts\n" : "", stderr: "" };
      }
      throw new Error(`unexpected git ${key}`);
    }
    if (command === "npm") {
      verified = true;
      return { status: verifyStatus, stdout: "", stderr: "" };
    }
    if (command === process.execPath) return { stderr: "", ...block };
    if (command === "gh") return { status: ghStatus, stdout: "{}", stderr: ghStatus ? "HTTP 422" : "" };
    throw new Error(`unexpected command ${command}`);
  };
  const lines = [];
  const run = (argv) => main(argv, { exec, cwd: "/repo", log: (line) => lines.push(line), error: (line) => lines.push(line) });
  const posts = () => calls.filter(([command]) => command === "gh");
  const verifies = () => calls.filter(([command]) => command === "npm");
  return { run, calls, posts, verifies, lines };
}

test("without --post-status it runs verify:pr on HEAD and never posts", () => {
  const h = harness();
  assert.equal(h.run([]), 0);
  assert.deepEqual(h.verifies(), [["npm", "run", "verify:pr", "--", "--rev", SHA]]);
  assert.equal(h.posts().length, 0);
});

test("without --post-status a failed run keeps its exit code and posts nothing", () => {
  const h = harness({ verifyStatus: 1, dirtyBefore: true });
  assert.equal(h.run(["--force"]), 1);
  assert.deepEqual(h.verifies(), [["npm", "run", "verify:pr", "--", "--rev", SHA, "--force"]]);
  assert.equal(h.posts().length, 0);
});

test("a dirty tree before the run refuses to post and does not run verify:pr", () => {
  const h = harness({ dirtyBefore: true });
  assert.equal(h.run(["--post-status"]), 1);
  assert.equal(h.verifies().length, 0);
  assert.equal(h.posts().length, 0);
});

test("a tree made dirty during the run refuses to post", () => {
  const h = harness({ dirtyAfter: true });
  assert.equal(h.run(["--post-status"]), 1);
  assert.equal(h.posts().length, 0);
});

test("HEAD moving during the run refuses to post", () => {
  const h = harness({ headAfter: OTHER });
  assert.equal(h.run(["--post-status"]), 1);
  assert.equal(h.posts().length, 0);
  assert.match(h.lines.join("\n"), /HEAD moved/);
});

test("a refused post keeps a failing exit code", () => {
  const h = harness({ headAfter: OTHER, verifyStatus: 1 });
  assert.equal(h.run(["--post-status"]), 1);
  assert.equal(h.posts().length, 0);
});

test("a pass posts success on the exact verified SHA", () => {
  const h = harness();
  assert.equal(h.run(["--post-status"]), 0);
  assert.deepEqual(h.posts(), [[
    "gh", "api", "--method", "POST", `repos/${REPO}/statuses/${SHA}`,
    "-f", "state=success",
    "-f", `context=${CONTEXT}`,
    "-f", `description=verify:pr passed on tree ${TREE.slice(0, 12)}`,
  ]]);
  assert.equal(CONTEXT, "verify-local/pr");
  assert.equal(REPO, "thannous/clawdeals");
});

test("a failed run posts failure with its exit code", () => {
  const h = harness({ verifyStatus: 1 });
  assert.equal(h.run(["--post-status"]), 1);
  const [post] = h.posts();
  assert.ok(post.includes("state=failure"));
  assert.ok(post.includes("description=verify:pr failed (exit 1)"));
  assert.ok(post.includes(`repos/${REPO}/statuses/${SHA}`));
});

test("an incomplete run (exit 2) posts failure", () => {
  const h = harness({ verifyStatus: 2 });
  assert.equal(h.run(["--post-status"]), 2);
  assert.ok(h.posts()[0].includes("state=failure"));
});

test("a pass whose proof-block names another commit or tree is not posted", () => {
  for (const block of [
    { status: 0, stdout: proofBlock(OTHER, TREE) },
    { status: 0, stdout: proofBlock(SHA, OTHER) },
    { status: 1, stdout: proofBlock() },
    { status: 0, stdout: "no proof" },
  ]) {
    const h = harness({ block });
    assert.equal(h.run(["--post-status"]), 1);
    assert.equal(h.posts().length, 0);
  }
});

test("a gh failure is reported as not posted", () => {
  const h = harness({ ghStatus: 1 });
  assert.equal(h.run(["--post-status"]), 1);
  assert.match(h.lines.join("\n"), /status not posted: gh api failed/);
});

test("--rev is refused as a usage error", () => {
  for (const argv of [["--rev", "HEAD~1"], ["--rev=HEAD~1", "--post-status"]]) {
    const h = harness();
    assert.equal(h.run(argv), 64);
    assert.equal(h.calls.length, 0);
  }
});

test("parseProofBlock reads the engine's SHA and tree lines", () => {
  assert.deepEqual(parseProofBlock(proofBlock()), { sha: SHA, tree: TREE });
  assert.deepEqual(parseProofBlock(""), { sha: null, tree: null });
});
