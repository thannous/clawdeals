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
    status: "passed",
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

function currentFixture(root) {
  const fixtureData = fixture(root);
  const { directory, run } = fixtureData;
  run.runner.version = "0.21.0";
  for (const result of run.results) {
    result.id = sha256(Buffer.from(`${result.targetId}/${result.testId}`));
    result.file = "tests/catalog.e2e.ts";
    result.titlePath = ["a public journey"];
    if (!result.attempts.length) continue;
    const segment = `catalog-a-public-journey-${result.id.slice(0, 16)}`;
    const folder = join(root, directory, "results", segment);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "trace.md"),
      `# ✓ a public journey\n\n<sub>e2e 0.21.0 · run \`${run.id}\` · the whole run is in \`report.json\`</sub>\n`,
    );
    const mediaPath = `${segment}/attempt-1/screen.png`;
    const bytes = Buffer.from(`synthetic screenshot ${result.targetId}`);
    mkdirSync(join(folder, "attempt-1"));
    writeFileSync(join(root, directory, "results", mediaPath), bytes);
    result.attempts[0].artifacts.push({
      id: `${result.id}:screen`,
      kind: "screenshot",
      path: mediaPath,
      size: bytes.length,
      sha256: sha256(bytes),
    });
  }
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  const commandPath = join(root, directory, "command.json");
  const command = JSON.parse(readFileSync(commandPath, "utf8"));
  Object.assign(command, {
    runner: run.runner,
    evidenceLayout: { artifactsDirectory: "results", traceFormat: "markdown" },
    requiredArtifactKinds: ["trace"],
  });
  writeFileSync(commandPath, JSON.stringify(command));
  return fixtureData;
}

test("0.21 result media and one trace page per executed result round-trip in a public bundle", (t) => {
  const root = temporary(t),
    { directory } = currentFixture(root);
  const index = inspectReport(root, directory, {
    requiredArtifactKinds: ["trace"],
  });
  assert.equal(index.evidenceComplete, true);
  assert.equal(index.journeysPassed, true);
  assert.equal(index.tracePages.length, 2);
  assert.equal(new Set(index.tracePages.map((page) => page.resultId)).size, 2);
  assert.equal(index.artifacts.length, 2);
  const bundle = bundleRuns(root, ".e2e/bundles/current", [directory]);
  assert.equal(bundle.evidenceComplete, true);
  assert.equal(
    bundle.files.filter((file) => file.path.endsWith("/trace.md")).length,
    2,
  );
  assert.equal(verifyBundle(root, bundle.output).journeysPassed, true);
});

for (const defect of [
  "missing",
  "empty",
  "other-run",
  "duplicate",
  "symlink",
]) {
  test(`0.21 required trace pages reject ${defect} evidence`, (t) => {
    const root = temporary(t),
      { directory, run } = currentFixture(root);
    const result = run.results[0];
    const folder = join(
      root,
      directory,
      "results",
      `catalog-a-public-journey-${result.id.slice(0, 16)}`,
    );
    const trace = join(folder, "trace.md");
    if (defect === "missing") rmSync(trace);
    if (defect === "empty") writeFileSync(trace, "");
    if (defect === "other-run")
      writeFileSync(
        trace,
        readFileSync(trace, "utf8").replace(run.id, "different-run"),
      );
    if (defect === "duplicate") {
      const duplicate = join(
        root,
        directory,
        "results",
        `duplicate-${result.id.slice(0, 16)}`,
      );
      mkdirSync(duplicate);
      writeFileSync(join(duplicate, "trace.md"), readFileSync(trace));
    }
    if (defect === "symlink") {
      const bytes = readFileSync(trace);
      rmSync(trace);
      writeFileSync(join(root, "unowned.md"), bytes);
      symlinkSync(join(root, "unowned.md"), trace);
    }
    const index = inspectReport(root, directory, {
      requiredArtifactKinds: ["trace"],
    });
    assert.equal(index.evidenceComplete, false);
    assert.ok(
      index.errors.some(
        (error) =>
          error.code === "TRACE_PAGE_MISSING_OR_INVALID" &&
          error.resultId === result.id,
      ),
    );
  });
}

test("0.21 changed media and a mismatched runner receipt cannot qualify", (t) => {
  const root = temporary(t),
    { directory, run } = currentFixture(root);
  const artifact = run.results[0].attempts[0].artifacts[0];
  writeFileSync(join(root, directory, "results", artifact.path), "tampered");
  assert.ok(
    inspectReport(root, directory).errors.some(
      (error) => error.code === "ARTIFACT_MISSING_OR_CHANGED",
    ),
  );
  const commandPath = join(root, directory, "command.json");
  const command = JSON.parse(readFileSync(commandPath, "utf8"));
  command.runner.version = "0.18.0";
  writeFileSync(commandPath, JSON.stringify(command));
  const bundle = bundleRuns(root, ".e2e/bundles/mismatched", [directory]);
  assert.equal(bundle.evidenceComplete, false);
  assert.ok(
    bundle.runs[0].errors.some(
      (error) => error.code === "RUNNER_RECEIPT_MISMATCH",
    ),
  );
});

test("0.18 keeps requiring and hashing its actual per-attempt ZIP trace", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  for (const result of run.results) {
    for (const attempt of result.attempts) {
      const path = `${attempt.id}/trace.zip`;
      const bytes = Buffer.from(`synthetic trace ${attempt.id}`);
      mkdirSync(join(root, directory, "artifacts", attempt.id), {
        recursive: true,
      });
      writeFileSync(join(root, directory, "artifacts", path), bytes);
      attempt.artifacts.push({
        id: `${attempt.id}:trace`,
        kind: "trace",
        path,
        size: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run }),
  );
  assert.equal(
    inspectReport(root, directory, { requiredArtifactKinds: ["trace"] })
      .evidenceComplete,
    true,
  );
  rmSync(
    join(
      root,
      directory,
      "artifacts",
      run.results[0].attempts[0].artifacts[0].path,
    ),
  );
  assert.equal(
    inspectReport(root, directory, { requiredArtifactKinds: ["trace"] })
      .evidenceComplete,
    false,
  );
});

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

test("missing or contradictory global verdict cannot qualify passed rows", (t) => {
  const root = temporary(t),
    { directory, run } = fixture(root);
  const missing = structuredClone(run);
  delete missing.status;
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run: missing }),
  );
  assert.throws(
    () => inspectReport(root, directory),
    /Malformed TesterArmy global status/,
  );
  for (const status of ["failed", "error", "interrupted", "blocked"]) {
    writeFileSync(
      join(root, directory, "report.json"),
      JSON.stringify({ schemaVersion: "report-1", run: { ...run, status } }),
    );
    const index = inspectReport(root, directory);
    assert.equal(index.evidenceComplete, false);
    assert.equal(index.journeysPassed, false);
    assert.ok(
      index.errors.some((error) => error.code === "GLOBAL_VERDICT_MISMATCH"),
    );
  }
  writeFileSync(
    join(root, directory, "report.json"),
    JSON.stringify({ schemaVersion: "report-1", run: { ...run, exitCode: 1 } }),
  );
  assert.equal(inspectReport(root, directory).journeysPassed, false);
  assert.equal(inspectReport(root, directory).evidenceComplete, false);
});
