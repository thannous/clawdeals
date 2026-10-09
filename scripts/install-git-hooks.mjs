import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `npm ci` and `npm install` run this through the `prepare` script. It points
// Git at the tracked `.githooks/` directory, so the pre-push check is active
// for anyone who installed dependencies. Outside a Git checkout of this
// repository (no Git, a deployment build without history) it does nothing and
// never fails the install.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hooksPath = ".githooks";

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function localHooksPath() {
  try {
    return git("config", "--local", "--get", "core.hooksPath");
  } catch {
    return "";
  }
}

try {
  const top = git("rev-parse", "--show-toplevel");
  const current = localHooksPath();
  if (realpathSync(top) === realpathSync(root) && current !== hooksPath) {
    git("config", "--local", "core.hooksPath", hooksPath);
    const previous = current ? ` (was ${current})` : "";
    console.log(
      `install-git-hooks: core.hooksPath set to ${hooksPath}${previous}; pre-push runs \`npm run test:ci\`.`,
    );
  }
} catch {
  // No Git or not a Git checkout: nothing to install.
}
