import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Probe of the `historical-corpus` release check (verify-local.config.mjs):
// exits 0 when the Chromium build pinned by playwright-core is installed, as
// the full browser or as the headless shell that headless runs launch, so the
// corpus starts without downloading a browser.
const require = createRequire(import.meta.url);
let executable = "";
try {
  executable = require("playwright-core").chromium.executablePath();
} catch {
  process.exit(1);
}
const pinned = /^(.*)[\\/]chromium-(\d+)[\\/]/.exec(executable);
const headlessShell = pinned
  ? join(pinned[1], `chromium_headless_shell-${pinned[2]}`, "INSTALLATION_COMPLETE")
  : "";
process.exit(existsSync(executable) || (headlessShell && existsSync(headlessShell)) ? 0 : 1);
