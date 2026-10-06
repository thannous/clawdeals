import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function safeFile(root, path) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith("../") || /[\r\n]/.test(rel))
    throw new Error("Evidence path leaves the owned root.");
  let current = root;
  for (const piece of rel.split("/")) {
    current = join(current, piece);
    if (lstatSync(current).isSymbolicLink())
      throw new Error("Evidence symlinks are refused.");
  }
  if (!lstatSync(absolute).isFile())
    throw new Error("Evidence must be a regular file.");
  return absolute;
}
export function listFiles(root, directory) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Evidence symlinks are refused.");
      if (
        ["sessions", "cache"].includes(entry.name) ||
        entry.name === "ai-trace.json"
      )
        return [];
      return entry.isDirectory() ? listFiles(root, path) : [path];
    })
    .sort();
}

// IDs come from report-1, not titles or an invented browser-context identifier.
// contextKey correlates the attempt-owned engine context; no extra contexts are
// created by the Clawdeals historical adapter.
export function inspectReport(
  root,
  directory,
  { requiredArtifactKinds = [] } = {},
) {
  const errors = [];
  const document = JSON.parse(
    readFileSync(safeFile(root, join(directory, "report.json")), "utf8"),
  );
  if (
    document.schemaVersion !== "report-1" ||
    !document.run?.results ||
    !document.run?.targets
  )
    throw new Error("Unsupported TesterArmy report schema.");
  const run = document.run;
  if (
    !["passed", "failed", "error", "interrupted", "blocked"].includes(
      run.status,
    )
  )
    throw new Error("Malformed TesterArmy global status.");
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const text = (value) => typeof value === "string" && value.length > 0;
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  const statuses = new Set([
    "passed",
    "failed",
    "interrupted",
    "flaky",
    "skipped",
  ]);
  if (
    !text(run.id) ||
    !object(run.usage) ||
    !object(run.summary) ||
    !Array.isArray(run.results) ||
    !Array.isArray(run.targets) ||
    !Array.isArray(run.serialGroups) ||
    !Array.isArray(run.errors) ||
    !integer(run.exitCode)
  )
    throw new Error("Malformed TesterArmy run.");
  const summaryFields = [
    "discovered",
    "selected",
    "executed",
    "passed",
    "failed",
    "interrupted",
    "flaky",
    "skipped",
  ];
  if (
    Object.keys(run.summary).sort().join() !== summaryFields.sort().join() ||
    summaryFields.some((field) => !integer(run.summary[field]))
  )
    throw new Error("Malformed TesterArmy summary.");
  if (
    run.targets.some((target) => !object(target) || !text(target.id)) ||
    new Set(run.targets.map((target) => target.id)).size !== run.targets.length
  )
    throw new Error("Malformed TesterArmy targets.");
  for (const result of run.results) {
    if (
      !object(result) ||
      !text(result.id) ||
      !text(result.targetId) ||
      !text(result.testId) ||
      !text(result.agent) ||
      !integer(result.repeat) ||
      typeof result.selected !== "boolean" ||
      !statuses.has(result.status) ||
      !Array.isArray(result.attempts)
    )
      throw new Error("Malformed TesterArmy result identity.");
    for (const attempt of result.attempts) {
      if (
        !object(attempt) ||
        !text(attempt.id) ||
        !integer(attempt.index) ||
        !statuses.has(attempt.status) ||
        !text(attempt.cleanup) ||
        !Array.isArray(attempt.artifacts) ||
        !Array.isArray(attempt.steps) ||
        !Array.isArray(attempt.secondaryErrors)
      )
        throw new Error("Malformed TesterArmy attempt.");
      if (
        attempt.steps.some(
          (step) => !object(step) || !text(step.kind) || !text(step.status),
        )
      )
        throw new Error("Malformed TesterArmy steps.");
      if (
        attempt.artifacts.some(
          (artifact) =>
            !object(artifact) ||
            !text(artifact.id) ||
            !text(artifact.kind) ||
            !integer(artifact.size) ||
            !/^[a-f0-9]{64}$/.test(artifact.sha256),
        )
      )
        throw new Error("Malformed TesterArmy artifacts.");
    }
  }
  if (run.usage?.modelTokens !== 0 || run.usage?.maxModelCallsInStep !== 0)
    throw Object.assign(
      new Error("Only model-free public evidence may be bundled."),
      { code: "NON_PUBLIC_EVIDENCE" },
    );
  if (run.serialGroups?.length)
    throw new Error(
      "Serial-context evidence requires its explicit report mapping.",
    );
  const seenPairs = new Set(),
    seenAttempts = new Set(),
    seenArtifacts = new Set();
  const seenContexts = new Set();
  const pairs = [],
    artifacts = [];
  for (const result of run.results) {
    const key = JSON.stringify([
      run.id,
      result.targetId,
      result.testId,
      result.agent,
      result.repeat,
    ]);
    if (seenPairs.has(key)) errors.push({ code: "DUPLICATE_PAIR", key });
    seenPairs.add(key);
    if (!run.targets.some((target) => target.id === result.targetId))
      errors.push({ code: "UNKNOWN_TARGET", key });
    const attempts = result.attempts.map((attempt) => {
      const contextKey = `${run.id}/${result.targetId}/${attempt.id}`;
      if (seenContexts.has(contextKey))
        errors.push({ code: "DUPLICATE_CONTEXT", key: contextKey });
      seenContexts.add(contextKey);
      for (const kind of requiredArtifactKinds) {
        if (!attempt.artifacts.some((artifact) => artifact.kind === kind))
          errors.push({
            code: "REQUIRED_MEDIA_MISSING",
            attemptId: attempt.id,
            kind,
          });
      }
      const attemptKey = JSON.stringify([key, attempt.id, attempt.index]);
      if (seenAttempts.has(attemptKey))
        errors.push({ code: "DUPLICATE_ATTEMPT", key: attemptKey });
      seenAttempts.add(attemptKey);
      for (const artifact of attempt.artifacts) {
        if (seenArtifacts.has(artifact.id))
          errors.push({ code: "DUPLICATE_ARTIFACT", id: artifact.id });
        seenArtifacts.add(artifact.id);
        try {
          if (
            typeof artifact.path !== "string" ||
            isAbsolute(artifact.path) ||
            artifact.path.split("/").includes("..")
          )
            throw new Error("Artifact path is not local to the run.");
          const path = join(directory, "artifacts", artifact.path);
          const bytes = readFileSync(safeFile(root, path));
          if (
            bytes.length !== artifact.size ||
            sha256(bytes) !== artifact.sha256
          )
            throw new Error("Artifact bytes differ from the SDK receipt.");
          artifacts.push({
            id: artifact.id,
            kind: artifact.kind,
            path,
            bytes: bytes.length,
            sha256: artifact.sha256,
            attemptKey,
          });
        } catch {
          errors.push({ code: "ARTIFACT_MISSING_OR_CHANGED", id: artifact.id });
        }
      }
      if (attempt.steps.some((step) => step.kind === "agent"))
        throw Object.assign(
          new Error("Agent evidence is excluded from public bundles."),
          { code: "NON_PUBLIC_EVIDENCE" },
        );
      return {
        attemptId: attempt.id,
        index: attempt.index,
        contextKey,
        status: attempt.status,
        cleanup: attempt.cleanup,
        secondaryErrorCount: attempt.secondaryErrors.length,
        failedStepCount: attempt.steps.filter(
          (step) => step.status !== "passed",
        ).length,
      };
    });
    pairs.push({
      key,
      resultId: result.id,
      targetId: result.targetId,
      testId: result.testId,
      agent: result.agent,
      repeat: result.repeat,
      selected: result.selected,
      status: result.status,
      skip: result.skip ?? null,
      attempts,
    });
  }
  const selected = pairs.filter((pair) => pair.selected);
  if (
    (run.status === "passed" &&
      (run.exitCode !== 0 ||
        run.errors.length > 0 ||
        selected.some((pair) => pair.status !== "passed"))) ||
    (run.status !== "passed" && run.exitCode === 0)
  )
    errors.push({ code: "GLOBAL_VERDICT_MISMATCH" });
  const computed = {
    discovered: pairs.length,
    selected: selected.length,
    executed: selected.filter((pair) => pair.attempts.length > 0).length,
    ...Object.fromEntries(
      ["passed", "failed", "interrupted", "flaky", "skipped"].map((status) => [
        status,
        selected.filter((pair) => pair.status === status).length,
      ]),
    ),
  };
  if (!isDeepStrictEqual(computed, run.summary))
    errors.push({ code: "SUMMARY_MISMATCH" });
  const passed =
    run.status === "passed" &&
    selected.length > 0 &&
    selected.every(
      (pair) =>
        pair.status === "passed" &&
        pair.attempts.length === 1 &&
        pair.attempts[0].index === 0 &&
        pair.attempts[0].status === "passed" &&
        pair.attempts[0].cleanup === "complete" &&
        pair.attempts[0].secondaryErrorCount === 0 &&
        pair.attempts[0].failedStepCount === 0,
    ) &&
    run.errors.length === 0 &&
    run.exitCode === 0;
  return {
    directory,
    runId: run.id,
    status: run.status,
    vcs: run.vcs,
    runner: run.runner,
    targets: run.targets,
    summary: run.summary,
    pairs,
    artifacts,
    errors,
    evidenceComplete: errors.length === 0,
    journeysPassed: passed,
  };
}

export function partitionFiles(files, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("Invalid evidence part size.");
  const parts = [];
  let part = { bytes: 0, files: [] };
  for (const file of files) {
    if (file.bytes > maximumBytes)
      throw new Error("An evidence file exceeds the bounded part size.");
    if (part.files.length && part.bytes + file.bytes > maximumBytes) {
      parts.push(part);
      part = { bytes: 0, files: [] };
    }
    part.files.push(file.path);
    part.bytes += file.bytes;
  }
  if (part.files.length) parts.push(part);
  return parts;
}

export function assertUnion(files, parts) {
  const expected = files.map((file) => file.path).sort();
  const actual = parts.flatMap((part) => part.files).sort();
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error("Evidence parts do not form the complete file union.");
}
