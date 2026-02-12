// Wrapper: keep repo-local installer behavior (writes command=node with a stable local server path),
// while sharing implementation with the published npm package.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // <repo>/scripts/mcp
const repoRoot = path.resolve(__dirname, "../..");

const serverPath = path.join(repoRoot, "scripts", "mcp-server.mjs");
const installerPath = path.join(repoRoot, "packages", "clawdeals-mcp", "mcp", "install.mjs");

function stripRepoInstallArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--") continue;
    if (a === "--local" || a === "--repo") continue;
    if (a === "--server-path") {
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

const passthrough = stripRepoInstallArgs(process.argv.slice(2));
const res = spawnSync(process.execPath, [installerPath, "--local", "--server-path", serverPath, ...passthrough], {
  stdio: "inherit",
  env: process.env
});

process.exit(typeof res.status === "number" ? res.status : 1);

