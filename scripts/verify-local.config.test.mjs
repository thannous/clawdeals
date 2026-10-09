import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import config from "../verify-local.config.mjs";
import { LINT_EVERYTHING } from "./lint-everything.mjs";
import { matchesAny, normaliseConfig } from "./verify-local.mjs";

// Repository contracts of verify-local.config.mjs that the shared engine
// cannot know about. Issue #14: a change that makes scripts/lint-changed.mjs
// lint every file must also put the `lint-changed` check in scope and in its
// fingerprint.
const checks = normaliseConfig(config).checks;
const lintChanged = checks.find((check) => check.name === "lint-changed");

test("lint-changed is a when-scoped check with explicit inputs", () => {
  assert.ok(lintChanged, "verify-local.config.mjs declares lint-changed");
  assert.ok(Array.isArray(lintChanged.when), "lint-changed has a when list");
  assert.ok(Array.isArray(lintChanged.inputs), "lint-changed has an inputs list");
  assert.ok(LINT_EVERYTHING.length > 0);
});

test("lint-changed.mjs takes its lint-everything list from lint-everything.mjs", () => {
  const source = readFileSync(new URL("./lint-changed.mjs", import.meta.url), "utf8");
  assert.match(source, /from "\.\/lint-everything\.mjs"/);
  assert.match(source, /new Set\(LINT_EVERYTHING_FILES\)/);
});

for (const file of LINT_EVERYTHING) {
  test(`${file} is listed explicitly in lint-changed when and inputs`, () => {
    assert.ok(lintChanged.when.includes(file), `${file} in when`);
    assert.ok(lintChanged.inputs.includes(file), `${file} in inputs`);
    assert.ok(matchesAny(file, lintChanged.when), `${file} matches when`);
    assert.ok(matchesAny(file, lintChanged.inputs), `${file} matches inputs`);
  });

  test(`a change to ${file} alone, or with docs, puts lint-changed in scope`, () => {
    // Same test as the engine's scope decision for a `when` check.
    for (const changed of [[file], [file, "README.md", "docs/hosting-cloudflare-vercel.md"]]) {
      const touched = changed.filter((path) => matchesAny(path, lintChanged.when));
      assert.deepEqual(touched, [file]);
    }
  });
}

test("a docs-only change leaves lint-changed out of scope", () => {
  const touched = ["README.md", "docs/hosting-cloudflare-vercel.md"].filter((path) => matchesAny(path, lintChanged.when));
  assert.deepEqual(touched, []);
});
