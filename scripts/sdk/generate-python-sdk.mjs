import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

const repoRoot = process.cwd();
const prepareScript = path.join(repoRoot, "scripts", "sdk", "prepare-openapi-for-sdks.mjs");
const specPath = spawnSync("node", [prepareScript], { encoding: "utf8" });
if (specPath.status !== 0) process.exit(specPath.status ?? 1);

const spec = specPath.stdout.trim();
const outDir = path.join(repoRoot, "sdk", "python", "src");
const genPkgDir = path.join(outDir, "clawdeals_sdk_generated");

fs.rmSync(genPkgDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const generatorCliVersion = "2.28.2";

run("npx", [
  "-y",
  `@openapitools/openapi-generator-cli@${generatorCliVersion}`,
  "generate",
  "-g",
  "python",
  "-i",
  spec,
  "-o",
  outDir,
  "--additional-properties=packageName=clawdeals_sdk_generated,projectName=clawdeals-sdk-generated,generateSourceCodeOnly=true"
]);
