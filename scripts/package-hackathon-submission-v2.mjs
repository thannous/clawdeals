import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "test-results/hackathon-video-v2");
const outputDir = path.resolve(
  process.env.HACKATHON_SUBMISSION_V2_DIR ||
    path.join(repoRoot, "submission-assets/webmcp-challenge/demo-video-v2")
);

const assets = [
  {
    source: "clawdeals-demo-video-v2.mp4",
    destination: "clawdeals-demo-video-v2.mp4"
  },
  {
    source: "clawdeals-demo-video-v2-captions-only.mp4",
    destination: "clawdeals-demo-video-v2-captions-only.mp4"
  },
  {
    source: "clawdeals-demo-v2-voiceover-en.wav",
    destination: "clawdeals-demo-v2-voiceover-en.wav"
  },
  { source: "capture-metadata.json", destination: "capture-metadata.json" },
  { source: "voiceover-metadata.json", destination: "voiceover-metadata.json" },
  { source: "video-metadata.json", destination: "video-metadata.json" },
  { source: "frames/01a-listing-proof.jpg", destination: "frames/01a-listing-proof.jpg" },
  { source: "frames/03b-policy-block.jpg", destination: "frames/03b-policy-block.jpg" },
  { source: "frames/05c-price-drop.jpg", destination: "frames/05c-price-drop.jpg" },
  { source: "frames/08-closing.jpg", destination: "frames/08-closing.jpg" },
  {
    source: "docs/hackathon/DEMO_VIDEO_V2_SUBTITLES.srt",
    destination: "clawdeals-demo-video-v2.en.srt",
    fromRepoRoot: true
  }
];

function fail(message) {
  throw new Error(`[hackathon-submission-v2] ${message}`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

await mkdir(outputDir, { recursive: true });

const manifestAssets = [];
for (const asset of assets) {
  const sourcePath = path.join(asset.fromRepoRoot ? repoRoot : sourceDir, asset.source);
  const destinationPath = path.join(outputDir, asset.destination);

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

const captureMetadata = JSON.parse(
  await readFile(path.join(outputDir, "capture-metadata.json"), "utf8")
);
const voiceoverMetadata = JSON.parse(
  await readFile(path.join(outputDir, "voiceover-metadata.json"), "utf8")
);
const videoMetadata = JSON.parse(
  await readFile(path.join(outputDir, "video-metadata.json"), "utf8")
);

const manifest = {
  kind: "clawdeals-webmcp-demo-video-v2-package",
  proof_layer: captureMetadata.proof_layer,
  publication_status: "NOT_PUBLISHED",
  title: "ClawDeals — Shopping agents you can actually trust",
  duration_seconds: videoMetadata.duration_seconds,
  data_environment: captureMetadata.data_environment,
  voice: voiceoverMetadata.voice,
  source_dir: path.relative(repoRoot, sourceDir),
  output_dir: path.relative(repoRoot, outputDir),
  assets: manifestAssets
};

await writeFile(
  path.join(outputDir, "submission-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(JSON.stringify(manifest, null, 2));
