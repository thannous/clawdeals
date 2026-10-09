import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LINT_EVERYTHING as LINT_EVERYTHING_FILES } from "./lint-everything.mjs";

// Targeted lint of `verify:pr` (common delivery rule v2, Q5): ESLint with
// `--max-warnings=0` on the JS/TS files changed since the merge base with
// origin/main, instead of the whole repository. A change to the ESLint
// configuration or to the dependencies can change the verdict on untouched
// files, so it lints everything, as does a clone without origin/main.
//
//   node scripts/lint-changed.mjs [--base <ref>]   (default origin/main)
//
// It runs on the checked-out commit (HEAD): in `verify:pr`, the isolated copy.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const LINT_EVERYTHING = new Set(LINT_EVERYTHING_FILES);
const MAX_FILES = 400;
// Same extensions as `npm run lint`.
const EVERYTHING = ["--ext", ".js,.jsx,.ts,.tsx"];

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "origin/main";
if (!base) {
  console.error("lint-changed: --base needs a ref.");
  process.exit(64);
}

function git(...gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function eslint(targets, options = []) {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("eslint/package.json");
  const bin = join(dirname(manifest), require(manifest).bin.eslint);
  const result = spawnSync(
    process.execPath,
    [bin, "--max-warnings=0", "--no-warn-ignored", ...options, "--", ...targets],
    { cwd: root, stdio: "inherit" },
  );
  return result.error ? 1 : (result.status ?? 1);
}

const mergeBase = git("merge-base", base, "HEAD");
if (!mergeBase) {
  console.log(`lint-changed: no merge base with ${base}; linting every file.`);
  process.exit(eslint(["."], EVERYTHING));
}
const changed = (
  git("diff", "--name-only", "-z", "--no-renames", "--diff-filter=d", mergeBase, "HEAD") ?? ""
)
  .split("\0")
  .filter(Boolean);
const config = changed.filter((file) => LINT_EVERYTHING.has(file));
const files = changed.filter((file) => CODE.test(file));
const short = mergeBase.slice(0, 12);

if (config.length || files.length > MAX_FILES) {
  const reason = config.length ? `${config.join(", ")} changed` : `${files.length} files changed`;
  console.log(`lint-changed: ${reason} since ${base} (${short}); linting every file.`);
  process.exit(eslint(["."], EVERYTHING));
}
if (files.length === 0) {
  console.log(`lint-changed: no JS/TS file changed since ${base} (${short}); nothing to lint.`);
  process.exit(0);
}
console.log(`lint-changed: linting ${files.length} JS/TS file(s) changed since ${base} (${short}).`);
process.exit(eslint(files));
