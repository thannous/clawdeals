import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const prepareScript = path.join(repoRoot, "scripts", "sdk", "prepare-openapi-for-sdks.mjs");
const outDir = path.join(repoRoot, "sdk", "typescript", "generated");
const specPath = spawnSync("node", [prepareScript], { encoding: "utf8" });

if (specPath.status !== 0) process.exit(specPath.status ?? 1);
const spec = specPath.stdout.trim();

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(repoRoot, "sdk", "typescript"), { recursive: true });

// Use a pinned generator-cli version for reproducibility.
const generatorCliVersion = "2.28.2";

run("npx", [
  "-y",
  `@openapitools/openapi-generator-cli@${generatorCliVersion}`,
  "generate",
  "-g",
  "typescript-fetch",
  "-i",
  spec,
  "-o",
  outDir,
  "--additional-properties=supportsES6=true,typescriptThreePlus=true,modelPropertyNaming=original,enumPropertyNaming=original,useSingleRequestParameter=true",
  "--global-property=apiTests=false,modelTests=false,modelDocs=false,apiDocs=false"
]);
