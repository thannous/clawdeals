import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "test-results/hackathon-video");
const outputDir = path.resolve(
  process.env.HACKATHON_SUBMISSION_DIR ||
    path.join(repoRoot, "submission-assets/webmcp-challenge")
);

const assets = [
  "clawdeals-webmcp-demo-final.mp4",
  "frames/00-hero.jpg",
  "frames/03-search-policy-fit.jpg",
  "frames/14-redacted-receipt.jpg"
];

function fail(message) {
  throw new Error(`[hackathon-submission] ${message}`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

await mkdir(outputDir, { recursive: true });

const manifestAssets = [];
for (const relativePath of assets) {
  const sourcePath = path.join(sourceDir, relativePath);
  const destinationPath = path.join(outputDir, relativePath);

  try {
    await stat(sourcePath);
  } catch {
    fail(`Missing generated asset: ${path.relative(repoRoot, sourcePath)}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);

  const details = await stat(destinationPath);
  manifestAssets.push({
    path: path.relative(repoRoot, destinationPath),
    size_bytes: details.size,
    sha256: await sha256(destinationPath)
  });
}

const manifest = {
  kind: "clawdeals-webmcp-submission-package",
  proof_layer: "LOCAL",
  publication_status: "NOT_PUBLISHED",
  source_dir: path.relative(repoRoot, sourceDir),
  output_dir: path.relative(repoRoot, outputDir),
  assets: manifestAssets
};

await writeFile(
  path.join(outputDir, "submission-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(JSON.stringify(manifest, null, 2));
