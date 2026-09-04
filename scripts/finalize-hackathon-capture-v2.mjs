import { spawnSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(repoRoot, "test-results/hackathon-video-v2");
const metadataPath = path.join(outputDir, "capture-metadata.json");
const concatPath = path.join(outputDir, "capture-concat.txt");
const finalPath = path.join(outputDir, "clawdeals-demo-v2-raw.mp4");
const expectedDuration = 138;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `[hackathon-video-v2-capture] ${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`
    );
  }
  return result.stdout || "";
}

if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  throw new Error("[hackathon-video-v2-capture] ffmpeg must be installed.");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (!Array.isArray(metadata.shots) || metadata.shots.length < 8) {
  throw new Error(`[hackathon-video-v2-capture] Invalid shot count: ${metadata.shot_count}.`);
}
const durationSeconds = metadata.shots.reduce((total, shot) => {
  if (typeof shot.file !== "string" || !Number.isFinite(shot.duration_seconds)) {
    throw new Error("[hackathon-video-v2-capture] Every shot needs a file and numeric duration.");
  }
  return total + shot.duration_seconds;
}, 0);
if (durationSeconds !== expectedDuration) {
  throw new Error(
    `[hackathon-video-v2-capture] Shot durations must total ${expectedDuration}s; got ${durationSeconds}s.`
  );
}

const concatLines = [];
for (const shot of metadata.shots) {
  const absolutePath = path.resolve(repoRoot, shot.file);
  await stat(absolutePath);
  concatLines.push(`file '${absolutePath.replaceAll("'", "'\\''")}'`);
  concatLines.push(`duration ${shot.duration_seconds}`);
}
const finalShotPath = path.resolve(repoRoot, metadata.shots.at(-1).file);
concatLines.push(`file '${finalShotPath.replaceAll("'", "'\\''")}'`);
await writeFile(concatPath, `${concatLines.join("\n")}\n`);

run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatPath,
  "-vf",
  "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#05090c,fps=30",
  "-t",
  String(expectedDuration),
  "-c:v",
  "libx264",
  "-profile:v",
  "high",
  "-preset",
  "fast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  finalPath
]);

const outputStat = await stat(finalPath);
if (outputStat.size < 100_000) {
  throw new Error(`[hackathon-video-v2-capture] Encoded video is unexpectedly small: ${outputStat.size} bytes.`);
}

console.log(
  JSON.stringify({
    kind: "clawdeals-demo-video-v2-raw-capture",
    proof_layer: "LOCAL",
    data_environment: "isolated sandbox",
    output: path.relative(repoRoot, finalPath),
    shot_count: metadata.shots.length,
    duration_seconds: durationSeconds,
    size_bytes: outputStat.size,
    publication_status: "NOT_PUBLISHED"
  })
);
