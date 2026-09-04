import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(repoRoot, "test-results/hackathon-video-v2");
const sourceDir = path.join(
  repoRoot,
  "submission-assets/webmcp-challenge/demo-video-v2/segments"
);
const voiceoverPath = path.join(outputDir, "clawdeals-demo-v2-voiceover-en.wav");
const expectedDuration = 138;

const scenes = [
  { index: 1, startMs: 0, endMs: 15000, jobId: "ddaa1e2d-f0ac-4af1-944e-ecb1c3d660a3", speechSeconds: 14.21, rate: "ok", attempts: 2 },
  { index: 2, startMs: 15000, endMs: 32000, jobId: "fdd80111-4296-4e4e-b7b9-d2ef767f0f44", speechSeconds: 15.57, rate: "ok", attempts: 2 },
  { index: 3, startMs: 32000, endMs: 53000, jobId: "fa4d3249-7137-45eb-8a73-9811ff434e94", speechSeconds: 15.01, rate: "ok", attempts: 2 },
  { index: 4, startMs: 53000, endMs: 72000, jobId: "f93ae1ab-7bb4-4db3-8cf6-9b49261c6769", speechSeconds: 16.93, rate: "slow", attempts: 3 },
  { index: 5, startMs: 72000, endMs: 92000, jobId: "714478b6-7fc8-4b42-a41d-db18945c1c1f", speechSeconds: 17.25, rate: "ok", attempts: 1 },
  { index: 6, startMs: 92000, endMs: 110000, jobId: "9641b5cb-1123-4a6d-998d-4d625719760c", speechSeconds: 15.49, rate: "slow", attempts: 2 },
  { index: 7, startMs: 110000, endMs: 127000, jobId: "ffb8cbbd-8124-457a-8e23-f03aebf90dbf", speechSeconds: 13.09, rate: "ok", attempts: 2 },
  { index: 8, startMs: 127000, endMs: 138000, jobId: "89d678d7-e64e-4cff-8088-c92dede24169", speechSeconds: 10.05, rate: "ok", attempts: 3 }
];

function fail(message) {
  throw new Error(`[hackathon-video-v2-voiceover] ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout || "";
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

for (const command of ["ffmpeg", "ffprobe"]) {
  if (spawnSync(command, ["-version"], { stdio: "ignore" }).status !== 0) {
    fail(`${command} must be installed.`);
  }
}

await mkdir(outputDir, { recursive: true });
const inputs = ["-f", "lavfi", "-t", String(expectedDuration), "-i", "anullsrc=r=48000:cl=stereo"];
const delayedLabels = [];
const filterParts = [];
const measuredScenes = [];

for (const [inputIndex, scene] of scenes.entries()) {
  const source = path.join(sourceDir, `voice${String(scene.index).padStart(2, "0")}.wav`);
  await readFile(source);
  const duration = Number(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      source
    ]).trim()
  );
  const windowSeconds = (scene.endMs - scene.startMs) / 1000;
  if (!Number.isFinite(duration) || duration > windowSeconds) {
    fail(`Scene ${scene.index} voice is ${duration}s but its window is ${windowSeconds}s.`);
  }
  inputs.push("-i", source);
  const label = `voice${scene.index}`;
  delayedLabels.push(`[${label}]`);
  filterParts.push(
    `[${inputIndex + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${scene.startMs}|${scene.startMs}[${label}]`
  );
  measuredScenes.push({
    ...scene,
    fileSeconds: Number(duration.toFixed(3)),
    source: path.relative(repoRoot, source),
    sha256: await sha256(source)
  });
}

filterParts.push(
  `[0:a]${delayedLabels.join("")}amix=inputs=${scenes.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[out]`
);

run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  ...inputs,
  "-filter_complex",
  filterParts.join(";"),
  "-map",
  "[out]",
  "-c:a",
  "pcm_s24le",
  voiceoverPath
]);

const renderedDuration = Number(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    voiceoverPath
  ]).trim()
);
if (Math.abs(renderedDuration - expectedDuration) > 0.05) {
  fail(`Rendered duration is ${renderedDuration}s; expected ${expectedDuration}s.`);
}

const metadata = {
  kind: "clawdeals-demo-video-v2-voiceover",
  proof_layer: "LOCAL",
  publication_status: "NOT_PUBLISHED",
  voice: {
    name: "Cillian",
    id: "d8ba9f14-8a24-44db-932b-99e16c45bd32",
    type: "preset",
    model: "text2speech_v2",
    variant: "elevenlabs"
  },
  duration_seconds: Number(renderedDuration.toFixed(3)),
  output_path: path.relative(repoRoot, voiceoverPath),
  output_sha256: await sha256(voiceoverPath),
  scenes: measuredScenes,
  quality_note:
    "Scenes 4 and 6 fit their windows without internal pauses but retain Cillian's measured 2.07 words-per-second delivery after bounded retries."
};
await writeFile(
  path.join(outputDir, "voiceover-metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`
);
console.log(JSON.stringify(metadata, null, 2));
