import { execFileSync } from "node:child_process";

// Vercel: exit 0 skips the build; exit 1 continues. Runs before installation.
// Compare with the last successful deployment, never just HEAD^: one push may
// contain several commits. Unknown paths or missing history always build.
// Production (VERCEL_ENV=production) always builds. A preview also skips
// changes to CI workflows, git hooks and agent notes, which never reach the
// deployed app. Browser tests stay in: tsconfig includes e2e/, so the build
// typechecks them.
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const internalFiles = new Set(["AGENTS.md", "README.md", "LICENSE"]);
const previewOnlyPrefixes = [".github/", ".githooks/", ".agents/"];
function hasNoWebEffect(file) {
  return internalFiles.has(file) || /^docs\/.*\.(?:md|txt)$/i.test(file);
}
function hasNoPreviewEffect(file) {
  return hasNoWebEffect(file) || previewOnlyPrefixes.some((prefix) => file.startsWith(prefix));
}

try {
  if (process.env.VERCEL_ENV === "production") {
    console.log("BUILD: production deployments always build.");
    process.exit(1);
  }
  if (!previous || !/^[a-f0-9]{40}$/i.test(previous)) {
    console.log("BUILD: no reliable previous deployment SHA.");
    process.exit(1);
  }
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", previous, "HEAD", "--"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .split("\0")
    .filter(Boolean);
  const relevant = files.filter((file) => !hasNoPreviewEffect(file));
  if (relevant.length) {
    console.log(
      `BUILD: ${relevant.length} application, migration or unknown inputs changed.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `SKIP: ${files.length} changes limited to documentation, CI or git hooks.`,
    );
    process.exitCode = 0;
  }
} catch {
  console.log("BUILD: Git history unavailable; preserve the deployment.");
  process.exitCode = 1;
}
