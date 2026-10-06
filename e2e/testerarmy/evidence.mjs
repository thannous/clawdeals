import { mkdirSync, lstatSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// One invocation owns one output directory. Never clear a previous SDK report.
export function reserveOutput(root, requested, selection) {
  const output =
    requested || `.e2e/runs/${selection}/${Date.now()}-${randomUUID()}`;
  const absolute = resolve(root, output);
  const path = relative(root, absolute);
  if (
    !path.startsWith(".e2e/") ||
    path.split("/").includes("cache") ||
    /[\r\n]/.test(path)
  ) {
    throw new Error(
      "TesterArmy output must be a fresh directory inside .e2e, outside cache.",
    );
  }
  let parent = root;
  for (const segment of relative(root, dirname(absolute)).split("/")) {
    parent = join(parent, segment);
    try {
      const metadata = lstatSync(parent);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error("Output parent is not an owned directory.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mkdirSync(parent);
    }
  }
  mkdirSync(absolute);
  return path;
}

export function describeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "ThrownValue", message: "Non-Error failure" };
}

export async function withEvidence(
  body,
  collectors,
  emit = (value) => console.error(JSON.stringify(value)),
) {
  const state = {
    bodyFailed: false,
    primaryError: undefined,
    secondaryErrors: [],
  };
  const rawSecondary = [];
  try {
    await body();
  } catch (error) {
    state.bodyFailed = true;
    state.primaryError = error;
  }
  for (const { phase, run } of collectors) {
    try {
      await run(state);
    } catch (error) {
      rawSecondary.push(error);
      state.secondaryErrors.push({ phase, ...describeError(error) });
    }
  }
  if (state.secondaryErrors.length) {
    try {
      emit({
        historicalEvidenceErrors: state.secondaryErrors,
        primaryError: state.bodyFailed
          ? describeError(state.primaryError)
          : null,
      });
    } catch (error) {
      rawSecondary.push(error);
    }
  }
  if (state.bodyFailed) throw state.primaryError;
  if (rawSecondary.length)
    throw new AggregateError(
      rawSecondary,
      "Historical evidence collection failed",
    );
}
