import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function extractFirstBashBlock(markdown) {
  const fence = "```bash";
  const start = markdown.indexOf(fence);
  if (start === -1) return null;
  const afterFence = markdown.indexOf("\n", start);
  if (afterFence === -1) return null;
  const end = markdown.indexOf("\n```", afterFence + 1);
  if (end === -1) return null;
  return markdown.slice(afterFence + 1, end).trim() + "\n";
}

const examplesPath = path.join(process.cwd(), "skills", "clawdeals", "examples.md");
const markdown = fs.readFileSync(examplesPath, "utf8");
const script = extractFirstBashBlock(markdown);

if (!script) {
  console.error(`No bash code block found in ${examplesPath}`);
  process.exit(1);
}

const result = spawnSync("bash", ["-lc", script], {
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);

