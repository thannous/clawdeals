import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function fail(message) {
  console.error(`[hackathon-release] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`missing ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    fail(`git ${args.join(" ")} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const expectedBranch = process.env.HACKATHON_RELEASE_BRANCH || "main";
const branch = git("branch", "--show-current");
if (branch !== expectedBranch) fail(`expected branch ${expectedBranch}, found ${branch || "detached HEAD"}`);

const status = git("status", "--porcelain=v1", "--untracked-files=all");
if (status) fail("working tree is not clean");

try {
  execFileSync("git", ["merge-base", "--is-ancestor", "webmcp-challenge-baseline", "HEAD"], {
    cwd: root,
    stdio: "ignore"
  });
} catch {
  fail("webmcp-challenge-baseline is not an ancestor of HEAD");
}

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
if (packageJson.packageManager !== "npm@11.17.0") fail("packageManager must stay pinned to npm@11.17.0");
if (packageLock.lockfileVersion !== 3) fail("package-lock.json must use lockfileVersion 3");

const requiredFiles = [
  ".env.example",
  ".nvmrc",
  "LICENSE",
  "HACKATHON.md",
  "README.md",
  "docs/hackathon/plan-de-victoire-webmcp-challenge.md",
  "docs/hackathon/release-candidate-runbook.md",
  "evals/webmcp/LIVE-BROWSER-EVIDENCE.md",
  "evals/webmcp/results/reference-selection.json",
  "supabase/seed.sql"
];
for (const file of requiredFiles) read(file);

if (read(".nvmrc").trim() !== "24.19.0") fail(".nvmrc must stay pinned to Node 24.19.0");

const envExample = read(".env.example");
const forbiddenSecretPatterns = [
  /\bcd_(?:live|sandbox)_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/
];
if (forbiddenSecretPatterns.some((pattern) => pattern.test(envExample))) {
  fail(".env.example contains a value shaped like a real credential");
}

for (const line of envExample.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]*(?:SECRET|TOKEN|KEY))=(.*)$/);
  if (!match) continue;
  const value = match[2].trim();
  if (value && !value.startsWith("replace-with-") && value !== "none") {
    fail(`.env.example must use a placeholder for ${match[1]}`);
  }
}

const selection = JSON.parse(read("evals/webmcp/results/reference-selection.json"));
if (selection.report?.passed !== true || selection.chatgptSelection !== "unproven") {
  fail("reference selection archive must pass while keeping ChatGPT selection explicitly unproven");
}

const head = git("rev-parse", "HEAD");
const baseline = git("rev-parse", "webmcp-challenge-baseline^{commit}");
const deltaCount = Number(git("rev-list", "--count", "webmcp-challenge-baseline..HEAD"));
const nodeVersion = process.version;
if (!nodeVersion.startsWith("v24.")) fail(`Node 24 is required, found ${nodeVersion}`);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      proof_layer: "LOCAL_PREFLIGHT",
      head,
      branch,
      baseline,
      challenge_commit_count: deltaCount,
      node: nodeVersion,
      package_manager: packageJson.packageManager,
      chatgpt_selection: selection.chatgptSelection,
      deployment: "NOT_CHECKED",
      public_smoke: "NOT_CHECKED",
      devpost_submission: "NOT_CHECKED"
    },
    null,
    2
  )
);
