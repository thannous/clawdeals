import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const subtitlePath = path.join(repoRoot, "docs/hackathon/DEMO_SUBTITLES.srt");
const outputDir = path.resolve(
  process.env.HACKATHON_VIDEO_DIR || path.join(repoRoot, "test-results/hackathon-video")
);
const segmentDir = path.join(outputDir, "voiceover-segments");
const voice = process.env.HACKATHON_VOICE || "Daniel";
const rate = Number(process.env.HACKATHON_VOICE_RATE || 155);

function fail(message) {
  throw new Error(`[hackathon-voiceover] ${message}`);
}

function timestampToMs(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) fail(`Invalid SRT timestamp: ${value}`);
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}

function parseSrt(source) {
  return source
    .trim()
    .split(/\r?\n\r?\n+/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const timing = lines[1]?.match(/^(.+) --> (.+)$/);
      if (!timing || lines.length < 3) fail(`Invalid SRT cue: ${block}`);
      return {
        index: Number(lines[0]),
        startMs: timestampToMs(timing[1]),
        endMs: timestampToMs(timing[2]),
        text: lines.slice(2).join(" ").trim()
      };
    });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout || "";
}

if (process.platform !== "darwin") {
  fail("The reproducible local voiceover currently requires macOS `say`.");
}
if (!Number.isFinite(rate) || rate < 100 || rate > 260) {
  fail("HACKATHON_VOICE_RATE must be between 100 and 260 words per minute.");
}
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  fail("ffmpeg must be installed.");
}
if (spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status !== 0) {
  fail("ffprobe must be installed.");
}

const cues = parseSrt(await readFile(subtitlePath, "utf8"));
if (cues.length === 0) fail("No subtitle cues found.");

for (const [index, cue] of cues.entries()) {
  if (!Number.isInteger(cue.index) || cue.index !== index + 1) {
    fail("Subtitle cue indexes must be consecutive and start at 1.");
  }
  if (cue.endMs <= cue.startMs) fail(`Cue ${cue.index} has a non-positive duration.`);
  if (index > 0 && cue.startMs < cues[index - 1].endMs) {
    fail(`Cue ${cue.index} overlaps cue ${cues[index - 1].index}.`);
  }
}

await mkdir(segmentDir, { recursive: true });

const segmentMetadata = [];
for (const cue of cues) {
  const segmentPath = path.join(segmentDir, `cue-${String(cue.index).padStart(2, "0")}.aiff`);
  run("say", ["-v", voice, "-r", String(rate), "-o", segmentPath, cue.text]);
  const durationSeconds = Number(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      segmentPath
    ]).trim()
  );
  const availableSeconds = (cue.endMs - cue.startMs) / 1_000;
  if (!Number.isFinite(durationSeconds) || durationSeconds > availableSeconds - 0.15) {
    fail(
      `Cue ${cue.index} voiceover is ${durationSeconds.toFixed(2)}s but only ${availableSeconds.toFixed(2)}s are available.`
    );
  }
  segmentMetadata.push({
    index: cue.index,
    start_ms: cue.startMs,
    end_ms: cue.endMs,
    speech_seconds: Number(durationSeconds.toFixed(3)),
    text: cue.text,
    path: path.relative(outputDir, segmentPath)
  });
}

const totalDurationMs = cues.at(-1).endMs;
const ffmpegInputs = [
  "-f",
  "lavfi",
  "-t",
  String(totalDurationMs / 1_000),
  "-i",
  "anullsrc=r=48000:cl=stereo"
];
const delayedLabels = [];
const filterParts = [];

for (const [index, cue] of cues.entries()) {
  const segmentPath = path.join(segmentDir, `cue-${String(cue.index).padStart(2, "0")}.aiff`);
  ffmpegInputs.push("-i", segmentPath);
  const label = `voice${index + 1}`;
  delayedLabels.push(`[${label}]`);
  filterParts.push(
    `[${index + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${cue.startMs}|${cue.startMs}[${label}]`
  );
}

filterParts.push(
  `[0:a]${delayedLabels.join("")}amix=inputs=${cues.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[out]`
);

const voiceoverPath = path.join(outputDir, "clawdeals-webmcp-voiceover.wav");
run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  ...ffmpegInputs,
  "-filter_complex",
  filterParts.join(";"),
  "-map",
  "[out]",
  "-c:a",
  "pcm_s16le",
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
if (Math.abs(renderedDuration * 1_000 - totalDurationMs) > 50) {
  fail(`Rendered duration is ${renderedDuration}s; expected ${totalDurationMs / 1_000}s.`);
}

const metadata = {
  kind: "clawdeals-webmcp-hackathon-voiceover",
  proof_layer: "LOCAL",
  voice,
  rate_wpm: rate,
  duration_seconds: Number(renderedDuration.toFixed(3)),
  cue_count: cues.length,
  subtitle_path: path.relative(repoRoot, subtitlePath),
  output_path: path.relative(repoRoot, voiceoverPath),
  cues: segmentMetadata
};
await writeFile(path.join(outputDir, "voiceover-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

console.log(JSON.stringify(metadata, null, 2));
