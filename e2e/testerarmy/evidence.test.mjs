import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reserveOutput, withEvidence } from "./evidence.mjs";
import { assertUnion, inspectReport, sha256 } from "./manifest.mjs";
import { bundleRuns, verifyBundle } from "./bundle.mjs";

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), "clawdeals-evidence-control-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("a body error survives a real manifest write failure and independent collection", async (t) => {
  const root = temporary(t),
    primary = new Error("synthetic primary failure"),
    originalStack = primary.stack;
  writeFileSync(join(root, "blocked"), "regular file");
  const emitted = [];
  let collected = false;
  await assert.rejects(
    withEvidence(
      async () => {
        throw primary;
      },
      [
        {
          phase: "manifest",
          run: () =>
            writeFileSync(join(root, "blocked", "artifacts.json"), "{}"),
        },
        {
          phase: "independent",
          run: () => {
            collected = true;
          },
        },
      ],
      (value) => emitted.push(value),
    ),
    (error) => error === primary && error.stack === originalStack,
  );
  assert.equal(collected, true);
  assert.equal(emitted[0].historicalEvidenceErrors[0].phase, "manifest");
  assert.match(emitted[0].historicalEvidenceErrors[0].message, /ENOTDIR/);
  assert.equal(emitted[0].primaryError.message, primary.message);
});

test("a passing body fails when its artifact collection fails", async (t) => {
  const root = temporary(t);
  writeFileSync(join(root, "blocked"), "regular file");
  await assert.rejects(
    withEvidence(
      async () => {},
      [
        {
          phase: "manifest",
          run: () =>
            writeFileSync(join(root, "blocked", "artifacts.json"), "{}"),
        },
      ],
      () => {},
    ),
    (error) =>
      error instanceof AggregateError && error.errors[0].code === "ENOTDIR",
  );
});

test("an existing output and a symlink cannot replace an older proof", (t) => {
  const root = temporary(t);
  const output = reserveOutput(root, ".e2e/control/first", "public");
  writeFileSync(join(root, output, "report.json"), "immutable original");
  assert.throws(() => reserveOutput(root, output, "public"), /EEXIST/);
  assert.equal(
    readFileSync(join(root, output, "report.json"), "utf8"),
    "immutable original",
  );
  symlinkSync(join(root, output), join(root, ".e2e", "foreign"));
  assert.throws(
    () => reserveOutput(root, ".e2e/foreign/new", "public"),
    /owned directory/,
  );
  assert.throws(
    () => reserveOutput(root, "../foreign", "public"),
    /fresh directory/,
  );
});

function fixture(root) {
  const directory = reserveOutput(root, ".e2e/runs/public/control", "public");
  const head = "a".repeat(40);
  const results = ["desktop", "mobile"].map((targetId, index) => ({
    id: `result-${index}`,
    testId: "same-public-test",
    targetId,
    agent: "default",
    repeat: 0,
    selected: true,
    status: "passed",
    attempts: [
      {
        id: `attempt-${index}`,
        index: 0,
        status: "passed",
        cleanup: "complete",
        secondaryErrors: [],
        steps: [],
        artifacts: [],
      },
    ],
  }));
  results.push({
    id: "excluded",
    testId: "excluded-test",
    targetId: "desktop",
    agent: "default",
    repeat: 0,
    selected: false,
    status: "skipped",
    skip: { reason: "selection" },
    attempts: [],
  });
  const run = {
    id: "public-report-control",
    vcs: { commit: head, dirty: false },
    runner: { name: "e2e", version: "0.18.0" },
    targets: ["desktop", "mobile"].map((id) => ({ id })),
    results,
    serialGroups: [],
    errors: [],
    exitCode: 0,
    usage: { modelTokens: 0, maxModelCallsInStep: 0 },
    summary: {
      discovered: 3,
      selected: 2,
      executed: 2,
      passed: 2,
      failed: 0,
      interrupted: 0,
      flaky: 0,
      skipped: 0,
    },
  };
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  writeFileSync(
    join(root, directory, "command.json"),
    JSON.stringify({
      selection: "public",
      publicEvidence: true,
      output: directory,
      sourceRevision: head,
      inputSha256: { "public-test.ts": "b".repeat(64) },
    }),
  );
  writeFileSync(
    join(root, directory, "completion.json"),
    JSON.stringify({
      primaryCode: 0,
      inputStable: true,
      inputSha256After: { "public-test.ts": "b".repeat(64) },
      runnerLogError: null,
    }),
  );
  return { directory, run };
}

test("same test on two targets and excluded results retain distinct identities", (t) => {
  const root = temporary(t),
    { directory } = fixture(root);
  const index = inspectReport(root, directory);
  assert.equal(index.evidenceComplete, true);
  assert.equal(index.journeysPassed, true);
  assert.equal(new Set(index.pairs.map((pair) => pair.key)).size, 3);
  assert.equal(
    new Set(
      index.pairs.flatMap((pair) =>
        pair.attempts.map((attempt) => attempt.contextKey),
      ),
    ).size,
    2,
  );
  assert.equal(
    index.pairs.filter((pair) => !pair.selected)[0].attempts.length,
    0,
  );
});

test("duplicate pairs and selected cases without attempts cannot qualify", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  run.results[1].targetId = "desktop";
  run.results[0].attempts = [];
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  const index = inspectReport(root, directory);
  assert.equal(index.evidenceComplete, false);
  assert.equal(index.journeysPassed, false);
  assert.ok(index.errors.some((error) => error.code === "DUPLICATE_PAIR"));
});

test("missing or changed declared artifacts cannot qualify", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  mkdirSync(join(root, directory, "artifacts"));
  writeFileSync(
    join(root, directory, "artifacts", "image.png"),
    "changed bytes",
  );
  run.results[0].attempts[0].artifacts = [
    {
      id: "declared",
      kind: "screenshot",
      path: "image.png",
      size: 8,
      sha256: sha256(Buffer.from("original")),
    },
  ];
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  assert.equal(inspectReport(root, directory).evidenceComplete, false);
});

test("requested media and reused context identity cannot disappear from proof", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  assert.equal(
    inspectReport(root, directory, { requiredArtifactKinds: ["trace"] })
      .evidenceComplete,
    false,
  );
  run.results[1].targetId = "desktop";
  run.results[1].testId = "different-test";
  run.results[1].attempts[0].id = run.results[0].attempts[0].id;
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  assert.ok(
    inspectReport(root, directory).errors.some(
      (error) => error.code === "DUPLICATE_CONTEXT",
    ),
  );
});

test("malformed identity arrays and booleans are refused, no-media remains valid", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  assert.equal(inspectReport(root, directory).evidenceComplete, true); // no artifacts directory needed
  for (const mutate of [
    (value) => {
      value.results[0].selected = "true";
    },
    (value) => {
      value.results[0].attempts = {};
    },
    (value) => {
      value.results[0].repeat = "0";
    },
    (value) => {
      value.results[0].attempts[0].artifacts = false;
    },
  ]) {
    const changed = structuredClone(run);
    mutate(changed);
    writeFileSync(
      join(root, directory, "report.json"),
      JSON.stringify({ schemaVersion: "report-1", run: changed }),
    );
    assert.throws(() => inspectReport(root, directory), /Malformed TesterArmy/);
  }
});

test("a failed step, cleanup or input receipt never becomes a complete pass", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  run.results[0].attempts[0].steps.push({
    kind: "assertion",
    status: "failed",
  });
  run.results[1].attempts[0].cleanup = "failed";
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  assert.equal(inspectReport(root, directory).journeysPassed, false);
  writeFileSync(
    join(root, directory, "completion.json"),
    JSON.stringify({
      primaryCode: 0,
      inputStable: true,
      runnerLogError: null,
      inputSha256After: {},
    }),
  );
  const index = bundleRuns(root, ".e2e/bundles/incomplete", [directory]);
  assert.equal(index.evidenceComplete, false);
  assert.equal(index.journeysPassed, false);
  assert.ok(
    index.runs[0].errors.some(
      (error) => error.code === "INPUT_RECEIPT_MISMATCH",
    ),
  );
  assert.equal(verifyBundle(root, index.output).journeysPassed, false);
});

test("bounded public parts round-trip every byte and reject tampering", (t) => {
  const root = temporary(t),
    { directory } = fixture(root);
  writeFileSync(join(root, directory, "runner.log"), Buffer.alloc(4000, 97));
  const bundle = bundleRuns(root, ".e2e/bundles/control", [directory], 4096);
  assert.ok(bundle.parts.length > 1);
  assertUnion(bundle.files, bundle.parts);
  const verified = verifyBundle(root, bundle.output);
  assert.equal(verified.files, bundle.files.length);
  assert.equal(verified.journeysPassed, true);
  const partManifest = join(root, bundle.output, "part-1", "manifest.json");
  const original = readFileSync(partManifest);
  writeFileSync(partManifest, "{}");
  assert.throws(
    () => verifyBundle(root, bundle.output),
    /Part manifest differs/,
  );
  writeFileSync(partManifest, original);
  writeFileSync(join(root, bundle.parts[0].archive), "tampered archive");
  assert.throws(() => verifyBundle(root, bundle.output), /archive changed/);
  assert.throws(
    () => assertUnion(bundle.files, bundle.parts.slice(1)),
    /complete file union/,
  );
});

test("model evidence is refused before public archive creation", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  run.usage.modelTokens = 1;
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  assert.throws(
    () => bundleRuns(root, ".e2e/bundles/refused", [directory]),
    /model-free public/,
  );
});
