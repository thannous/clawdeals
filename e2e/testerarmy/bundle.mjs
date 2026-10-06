import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { reserveOutput } from "./evidence.mjs";
import {
  assertUnion,
  inspectReport,
  listFiles,
  partitionFiles,
  safeFile,
  sha256,
} from "./manifest.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const payloadLimit = 384 * 1024 * 1024;
const uploadLimit = 480 * 1024 * 1024; // 32 MiB remain for the provider ZIP envelope.
const maximumParts = 4;

export function bundleRuns(
  repository,
  requested,
  runDirectories,
  limit = payloadLimit,
) {
  if (runDirectories.length === 0)
    throw new Error("Explicit public run directories are required.");
  const output = reserveOutput(repository, requested, "bundles");
  const runs = [],
    files = [],
    errors = [];
  for (const directory of runDirectories) {
    if (!directory.startsWith(".e2e/") || directory.split("/").includes(".."))
      throw new Error("Only explicit TesterArmy run directories are accepted.");
    let command;
    try {
      command = JSON.parse(
        readFileSync(
          safeFile(repository, join(directory, "command.json")),
          "utf8",
        ),
      );
    } catch {
      errors.push({ directory, code: "RUN_NOT_STARTED_OR_RECEIPT_MISSING" });
      continue;
    }
    if (
      command.publicEvidence !== true ||
      !["public", "historical", "production-public"].includes(
        command.selection,
      ) ||
      command.output !== directory
    )
      throw new Error("This invocation is not exportable public evidence.");
    try {
      if (
        command.requiredArtifactKinds !== undefined &&
        (!Array.isArray(command.requiredArtifactKinds) ||
          command.requiredArtifactKinds.some(
            (kind) => !["trace", "screenshot", "video"].includes(kind),
          ))
      )
        throw new Error("Malformed requested media policy.");
      const report = inspectReport(repository, directory, {
        requiredArtifactKinds: command.requiredArtifactKinds ?? [],
      });
      const completion = JSON.parse(
        readFileSync(
          safeFile(repository, join(directory, "completion.json")),
          "utf8",
        ),
      );
      if (completion.inputStable !== true || completion.runnerLogError !== null)
        report.errors.push({ code: "INPUT_OR_LOG_INCOMPLETE" });
      if (!isDeepStrictEqual(command.inputSha256, completion.inputSha256After))
        report.errors.push({ code: "INPUT_RECEIPT_MISMATCH" });
      if (
        completion.primaryCode !== 0 ||
        completion.signal ||
        completion.launchError
      )
        report.journeysPassed = false;
      if (report.vcs?.commit !== command.sourceRevision)
        report.errors.push({ code: "SOURCE_MISMATCH" });
      report.evidenceComplete = report.errors.length === 0;
      runs.push(report);
    } catch (error) {
      if (error.code === "NON_PUBLIC_EVIDENCE") throw error;
      errors.push({
        directory,
        code: "REPORT_INCOMPLETE",
        message: error.message,
      });
    }
    for (const path of listFiles(repository, directory)) {
      const bytes = readFileSync(safeFile(repository, path));
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  if (
    new Set(files.map((file) => file.path)).size !== files.length ||
    new Set(runs.map((run) => run.runId)).size !== runs.length
  )
    throw new Error("Duplicate run/file evidence.");
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const partitions = partitionFiles(files, limit);
  assertUnion(files, partitions);
  if (partitions.length > maximumParts)
    throw new Error(
      "Public evidence exceeds the four available CI upload parts.",
    );
  const parts = partitions.map((part, index) => {
    const directory = join(output, `part-${index + 1}`);
    mkdirSync(join(repository, directory));
    const list = join(repository, output, `part-${index + 1}.files`);
    writeFileSync(list, part.files.join("\n") + "\n", { flag: "wx" });
    const archive = join(directory, "evidence.tar.gz");
    execFileSync("tar", [
      "-czf",
      join(repository, archive),
      "-C",
      repository,
      "-T",
      list,
    ]);
    const bytes = readFileSync(join(repository, archive));
    return {
      index: index + 1,
      archive,
      bytes: bytes.length,
      sha256: sha256(bytes),
      files: part.files,
    };
  });
  const manifest = {
    format: "clawdeals-public-evidence-bundle-v1",
    output,
    publicEvidence: true,
    evidenceComplete:
      errors.length === 0 &&
      runs.length === runDirectories.length &&
      runs.every((run) => run.evidenceComplete),
    journeysPassed:
      errors.length === 0 &&
      runs.length === runDirectories.length &&
      runs.every((run) => run.journeysPassed),
    maximumUploadBytes: uploadLimit,
    runs,
    errors,
    files,
    parts,
    exclusions: ["agent runs", "sessions", "replay cache", "ai-trace.json"],
  };
  const text = JSON.stringify(manifest, null, 2) + "\n";
  for (const part of parts) {
    if (part.bytes + Buffer.byteLength(text) > uploadLimit)
      throw new Error("Evidence upload part exceeds its bounded size.");
    writeFileSync(
      join(repository, output, `part-${part.index}`, "manifest.json"),
      text,
      { flag: "wx" },
    );
  }
  writeFileSync(join(repository, output, "manifest.json"), text, {
    flag: "wx",
  });
  return manifest;
}

// Validate the actual archives, not only the original files or manifest counts.
export function verifyBundle(repository, directory) {
  const manifestBytes = readFileSync(
    safeFile(repository, join(directory, "manifest.json")),
  );
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.format !== "clawdeals-public-evidence-bundle-v1" ||
    manifest.publicEvidence !== true
  )
    throw new Error("Unknown public evidence bundle.");
  assertUnion(manifest.files, manifest.parts);
  const temporary = mkdtempSync(join(tmpdir(), "clawdeals-evidence-"));
  try {
    for (const part of manifest.parts) {
      const copiedManifest = readFileSync(
        safeFile(
          repository,
          join(directory, `part-${part.index}`, "manifest.json"),
        ),
      );
      if (!copiedManifest.equals(manifestBytes))
        throw new Error(
          "Part manifest differs from the complete evidence index.",
        );
      const archive = safeFile(repository, part.archive);
      const bytes = readFileSync(archive);
      if (
        bytes.length !== part.bytes ||
        sha256(bytes) !== part.sha256 ||
        bytes.length + manifestBytes.length > uploadLimit
      )
        throw new Error("Evidence archive changed.");
      const names = execFileSync("tar", ["-tzf", archive], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      })
        .trim()
        .split("\n")
        .sort();
      if (
        JSON.stringify(names) !== JSON.stringify([...part.files].sort()) ||
        names.some(
          (name) => name.startsWith("/") || name.split("/").includes(".."),
        )
      )
        throw new Error("Archive membership differs from its manifest.");
      const types = execFileSync("tar", ["-tvzf", archive], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      })
        .trim()
        .split("\n");
      if (types.some((line) => !line.startsWith("-")))
        throw new Error("Only regular evidence files may be extracted.");
      execFileSync("tar", ["-xzf", archive, "-C", temporary]);
    }
    for (const file of manifest.files) {
      const bytes = readFileSync(safeFile(temporary, file.path));
      if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
        throw new Error("Bundled file differs from its receipt.");
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return {
    parts: manifest.parts.length,
    files: manifest.files.length,
    evidenceComplete: manifest.evidenceComplete,
    journeysPassed: manifest.journeysPassed,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, directory, ...runs] = process.argv.slice(2);
  if (!directory || !["create", "verify"].includes(command))
    throw new Error(
      "Usage: bundle.mjs create|verify output [explicit run directories]",
    );
  const result =
    command === "create"
      ? bundleRuns(root, directory, runs)
      : verifyBundle(root, directory);
  if (process.env.GITHUB_OUTPUT && command === "create")
    appendFileSync(process.env.GITHUB_OUTPUT, `parts=${result.parts.length}\n`);
  if (command === "create") verifyBundle(root, directory);
  console.log(
    JSON.stringify({
      parts: result.parts.length ?? result.parts,
      files: result.files.length ?? result.files,
      evidenceComplete: result.evidenceComplete,
      journeysPassed: result.journeysPassed,
    }),
  );
  if (!result.evidenceComplete || !result.journeysPassed) process.exitCode = 2;
}
