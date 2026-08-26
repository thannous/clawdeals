import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHATGPT_SELECTION_STATUS,
  DEFAULT_REPEATS,
  EVIDENCE_KIND,
  MIN_FIRST_TOOL_ACCURACY,
  evaluateSelectionCases
} from "../src/webmcp/evals/reference-selection.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = join(root, "evals/webmcp/reference-selection.cases.json");
const resultsDir = join(root, "evals/webmcp/results");
const resultPath = join(resultsDir, "reference-selection.json");

function loadCorpus() {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  if (!Array.isArray(corpus.cases) || corpus.cases.length < 20) {
    throw new Error("reference-selection corpus must contain at least 20 cases");
  }
  return corpus;
}

function buildArchive(report, corpus, generatedAt) {
  return {
    generatedAt,
    chatgptSelection: CHATGPT_SELECTION_STATUS,
    evidenceKind: EVIDENCE_KIND,
    corpusPath: "evals/webmcp/reference-selection.cases.json",
    corpusChatgptSelection: corpus.chatgptSelection,
    minFirstToolAccuracy: MIN_FIRST_TOOL_ACCURACY,
    report
  };
}

function writeArchive(report, corpus) {
  mkdirSync(resultsDir, { recursive: true });
  const payload = buildArchive(report, corpus, new Date().toISOString());
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function checkArchive(report, corpus) {
  if (!existsSync(resultPath)) {
    fail("Archived result is missing. Run with --write after reviewing the eval output.");
  }
  const archived = JSON.parse(readFileSync(resultPath, "utf8"));
  const expected = buildArchive(report, corpus, archived.generatedAt);
  if (JSON.stringify(archived) !== JSON.stringify(expected)) {
    fail("Archived result is stale. Run with --write after reviewing the changed corpus or planner.");
  }
  return archived;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const corpus = loadCorpus();
if (corpus.chatgptSelection !== CHATGPT_SELECTION_STATUS) {
  fail(`Corpus chatgptSelection must be ${CHATGPT_SELECTION_STATUS}; ChatGPT selection is unproven.`);
}

const report = evaluateSelectionCases(corpus.cases, { repeats: DEFAULT_REPEATS });
const shouldWrite = process.argv.includes("--write");
const archived = shouldWrite ? writeArchive(report, corpus) : checkArchive(report, corpus);

console.log(
  JSON.stringify(
    {
      kind: report.kind,
      chatgptSelection: report.chatgptSelection,
      evidenceKind: report.evidenceKind,
      caseCount: report.caseCount,
      repeats: report.repeats,
      firstToolAccuracy: Number(report.firstToolAccuracy.toFixed(4)),
      passed: report.passed,
      archiveMode: shouldWrite ? "written" : "checked",
      resultPath: "evals/webmcp/results/reference-selection.json"
    },
    null,
    2
  )
);

if (archived.chatgptSelection !== "unproven") {
  fail("Archived result must label ChatGPT selection as unproven.");
}
if (!report.passed || report.firstToolAccuracy < MIN_FIRST_TOOL_ACCURACY) {
  fail(
    `Reference-selection eval failed: first-tool accuracy ${report.firstToolAccuracy} below ${MIN_FIRST_TOOL_ACCURACY} or non-deterministic.`
  );
}
if (!report.results.every((result) => result.deterministic && result.ok)) {
  fail("Every case must be deterministic and match expected first tool, sequence, refusal, and registry constraints.");
}
