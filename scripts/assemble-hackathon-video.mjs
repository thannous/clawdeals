import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.resolve(
  process.env.HACKATHON_VIDEO_DIR || path.join(repoRoot, "test-results/hackathon-video")
);
const rawVideoPath = path.join(outputDir, "clawdeals-webmcp-demo-raw.mp4");
const voiceoverPath = path.join(outputDir, "clawdeals-webmcp-voiceover.wav");
const subtitlePath = path.join(repoRoot, "docs/hackathon/DEMO_SUBTITLES.srt");
const finalVideoPath = path.join(outputDir, "clawdeals-webmcp-demo-final.mp4");
const metadataPath = path.join(outputDir, "video-metadata.json");
const expectedDuration = 160;

function fail(message) {
  throw new Error(`[hackathon-video] ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout || "";
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function timestampToSeconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) fail(`Invalid SRT timestamp: ${value}`);
  return (
    Number(match[1]) * 3_600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1_000
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
        start: timestampToSeconds(timing[1]),
        end: timestampToSeconds(timing[2]),
        text: lines.slice(2).join(" ").trim()
      };
    });
}

for (const command of ["ffmpeg", "ffprobe"]) {
  if (spawnSync(command, ["-version"], { stdio: "ignore" }).status !== 0) {
    fail(`${command} must be installed.`);
  }
}

for (const requiredPath of [rawVideoPath, voiceoverPath, subtitlePath]) {
  try {
    await readFile(requiredPath);
  } catch {
    fail(`Missing required input: ${path.relative(repoRoot, requiredPath)}`);
  }
}

const subtitleCues = parseSrt(await readFile(subtitlePath, "utf8"));
const captionDir = path.join(outputDir, "caption-overlays");
const captionPaths = subtitleCues.map((cue) =>
  path.join(captionDir, `cue-${String(cue.index).padStart(2, "0")}.png`)
);
for (const captionPath of captionPaths) await readFile(captionPath);

const ffmpegInputs = ["-i", rawVideoPath, "-i", voiceoverPath];
for (const captionPath of captionPaths) {
  ffmpegInputs.push("-loop", "1", "-framerate", "1", "-i", captionPath);
}
const filterParts = [
  "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,tpad=stop_mode=clone:stop_duration=5[base0]"
];
for (const [index, cue] of subtitleCues.entries()) {
  filterParts.push(`[${index + 2}:v]format=rgba[caption${index}]`);
  filterParts.push(
    `[base${index}][caption${index}]overlay=0:0:enable='between(t,${cue.start},${cue.end})'[base${index + 1}]`
  );
}
const finalVideoLabel = `[base${subtitleCues.length}]`;

run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  ...ffmpegInputs,
  "-filter_complex",
  filterParts.join(";"),
  "-map",
  finalVideoLabel,
  "-map",
  "1:a:0",
  "-t",
  String(expectedDuration),
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  finalVideoPath
]);

const probe = JSON.parse(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels",
    "-of",
    "json",
    finalVideoPath
  ])
);
const duration = Number(probe.format?.duration);
const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
if (!Number.isFinite(duration) || duration >= 180 || Math.abs(duration - expectedDuration) > 0.1) {
  fail(`Final duration must be ${expectedDuration}s and under 180s; got ${duration}s.`);
}
if (videoStream?.width !== 1920 || videoStream?.height !== 1080) {
  fail(`Final video must be 1920x1080; got ${videoStream?.width}x${videoStream?.height}.`);
}
if (!audioStream) fail("Final video has no audio stream.");

const metadata = {
  kind: "clawdeals-webmcp-hackathon-video",
  proof_layer: "LOCAL",
  publication_status: "NOT_PUBLISHED",
  duration_seconds: Number(duration.toFixed(3)),
  video: {
    codec: videoStream.codec_name,
    width: videoStream.width,
    height: videoStream.height
  },
  audio: {
    codec: audioStream.codec_name,
    sample_rate: Number(audioStream.sample_rate),
    channels: audioStream.channels
  },
  inputs: {
    raw_video_sha256: await sha256(rawVideoPath),
    voiceover_sha256: await sha256(voiceoverPath),
    subtitles_sha256: await sha256(subtitlePath)
  },
  output: {
    path: path.relative(repoRoot, finalVideoPath),
    sha256: await sha256(finalVideoPath)
  },
  references: {
    repo_plan:
      "https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md",
    drive_plan:
      "https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk"
  }
};

await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata, null, 2));
