import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  createWriteStream,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reserveOutput, describeError } from "./evidence.mjs";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(
  new URL("./preload-matchers.mjs", import.meta.url),
);
function inputFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? inputFiles(path)
        : /\.(ts|mjs)$/.test(path)
          ? [path]
          : [];
    },
  );
}
function inputs() {
  const files = [
    "e2e.config.ts",
    "package.json",
    "package-lock.json",
    "e2e/ui/helpers/api.ts",
    "src/ui/Landing.tsx",
    "src/ui/developer/connect/StepConnect.tsx",
    "src/ui/webmcp/CatalogAvailabilityNotice.tsx",
    "messages/en.json",
    "messages/fr.json",
    "messages/es.json",
    "src/shared/i18n.ts",
    ...inputFiles("e2e/testerarmy"),
  ];
  return Object.fromEntries(
    files.sort().map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(join(root, path)))
        .digest("hex"),
    ]),
  );
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error("Cannot identify TesterArmy source.");
  return result.stdout.trim();
}

export async function execute({ historical = false } = {}) {
  // Same precedence as e2e.config.ts. Identify private AI selection before any
  // receipt is labelled public, including opt-ins from the ignored local file.
  dotenv.config({ path: join(root, ".env.testerarmy.local"), quiet: true });
  dotenv.config({ path: join(root, ".env.local"), quiet: true });
  const [command = "run", ...args] = process.argv.slice(2);
  if (!["run", "list"].includes(command))
    throw new Error("TesterArmy entry supports run or list.");
  if (args.some((arg) => /^--(?:output|config|last-failed)(?:=|$)/.test(arg)))
    throw new Error(
      "Output/config overrides and in-place reruns are refused; use a fresh PARITY_OUTPUT.",
    );
  if (historical) {
    const values = new Set(["--grep", "--grep-invert", "--repeat-each"]);
    const switches = new Set(["--headed", "--trace", "--no-cache"]);
    for (let i = 0; i < args.length; i++) {
      if (switches.has(args[i])) continue;
      if (!values.has(args[i]) || !args[++i] || args[i].startsWith("--"))
        throw new Error("Unsupported historical selection.");
    }
  }
  const selection = historical
    ? "historical"
    : process.env.TESTERARMY_PRODUCTION_PUBLIC === "1"
      ? "production-public"
      : process.env.TESTERARMY_AI === "1"
        ? "ai"
        : "public";
  const env = {
    ...process.env,
    E2E_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
  };
  if (historical)
    Object.assign(env, {
      TESTERARMY_AI: "0",
      TESTERARMY_HISTORICAL: "1",
      E2E_APP_NODE_OPTIONS: process.env.NODE_OPTIONS ?? "",
      E2E_APP_NODE_OPTIONS_PRESENT: Object.hasOwn(process.env, "NODE_OPTIONS")
        ? "1"
        : "0",
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ""} --import ${JSON.stringify(preload)}`.trim(),
    });
  const argv = [
    ...(historical ? ["--import", preload] : []),
    join(root, "node_modules/e2e/dist/cli/bin.js"),
    command,
    ...(historical ? ["--target", "desktop"] : []),
    ...args,
  ];
  let output, before, log;
  if (command === "run") {
    output = reserveOutput(root, process.env.PARITY_OUTPUT, selection);
    env.PARITY_OUTPUT = output;
    before = inputs();
    writeFileSync(
      join(root, output, "command.json"),
      JSON.stringify(
        {
          format: "clawdeals-testerarmy-command-v1",
          selection,
          publicEvidence: selection !== "ai",
          requiredArtifactKinds: ["trace"], // e2e.config.ts keeps trace: "on"
          command: [
            process.execPath,
            historical
              ? "e2e/testerarmy/run-historical.mjs"
              : "e2e/testerarmy/run.mjs",
            command,
            ...args,
          ],
          output,
          node: process.version,
          sourceRevision: git(["rev-parse", "HEAD"]),
          sourceDirty: Boolean(
            git(["status", "--porcelain", "--untracked-files=no"]),
          ),
          inputSha256: before,
          nodeOptionsRestored: Object.hasOwn(process.env, "NODE_OPTIONS")
            ? "original value"
            : "absent",
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    log = createWriteStream(join(root, output, "runner.log"), { flags: "wx" });
  }
  const child = spawn(process.execPath, argv, {
    cwd: root,
    env,
    stdio: command === "run" ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  let logError, signal;
  log?.on("error", (error) => {
    logError = error;
  });
  if (log)
    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ])
      stream.on("data", (data) => {
        destination.write(data);
        log.write(data);
      });
  const interrupt = (value) => {
    signal = value;
    child.kill(value);
  };
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  let primaryCode, launchError;
  try {
    primaryCode = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("close", (code) => done(code ?? 1));
    });
  } catch (error) {
    primaryCode = 1;
    launchError = describeError(error);
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
  let secondary = false;
  if (log)
    await new Promise((done) => {
      if (log.destroyed) {
        done();
        return;
      }
      log.once("error", done);
      log.once("finish", done);
      log.end();
    });
  if (output) {
    try {
      const after = inputs();
      const stable = JSON.stringify(before) === JSON.stringify(after);
      secondary = !stable || Boolean(logError);
      writeFileSync(
        join(root, output, "completion.json"),
        JSON.stringify(
          {
            format: "clawdeals-testerarmy-completion-v1",
            primaryCode,
            signal: signal ?? null,
            launchError: launchError ?? null,
            inputStable: stable,
            inputSha256After: after,
            runnerLogError: logError
              ? { name: logError.name, code: logError.code }
              : null,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
    } catch (error) {
      secondary = true;
      console.error(
        JSON.stringify({
          testerarmyEvidenceError: { name: error.name, message: error.message },
        }),
      );
    }
  }
  process.exitCode = signal
    ? signal === "SIGINT"
      ? 130
      : 143
    : primaryCode || (secondary ? 3 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await execute();
