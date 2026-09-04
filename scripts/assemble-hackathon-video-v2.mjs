import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(repoRoot, "test-results/hackathon-video-v2");
const rawVideoPath = path.join(outputDir, "clawdeals-demo-v2-raw.mp4");
const voiceoverPath = path.join(outputDir, "clawdeals-demo-v2-voiceover-en.wav");
const subtitlePath = path.join(repoRoot, "docs/hackathon/DEMO_VIDEO_V2_SUBTITLES.srt");
const musicPath = path.join(outputDir, "clawdeals-demo-v2-music-bed.wav");
const clickPath = path.join(outputDir, "clawdeals-demo-v2-click.wav");
const finalVideoPath = path.join(outputDir, "clawdeals-demo-video-v2.mp4");
const captionsOnlyPath = path.join(outputDir, "clawdeals-demo-video-v2-captions-only.mp4");
const metadataPath = path.join(outputDir, "video-metadata.json");
const expectedDuration = 138;

function fail(message) {
  throw new Error(`[hackathon-video-v2] ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function timestampToSeconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) fail(`Invalid SRT timestamp: ${value}`);
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
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
await mkdir(outputDir, { recursive: true });
for (const requiredPath of [rawVideoPath, voiceoverPath, subtitlePath]) await readFile(requiredPath);

const subtitleCues = parseSrt(await readFile(subtitlePath, "utf8"));
if (subtitleCues.at(-1)?.end !== expectedDuration) {
  fail(`Final subtitle cue must end at ${expectedDuration}s.`);
}
const captionDir = path.join(outputDir, "caption-overlays");
const captionPaths = subtitleCues.map((cue) =>
  path.join(captionDir, `cue-${String(cue.index).padStart(2, "0")}.png`)
);
for (const captionPath of captionPaths) await readFile(captionPath);
run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  `aevalsrc=0.16*sin(2*PI*110*t)+0.09*sin(2*PI*165*t)+0.05*sin(2*PI*220*t):s=48000:d=${expectedDuration}`,
  "-af",
  `tremolo=f=0.1:d=0.35,lowpass=f=900,afade=t=in:st=0:d=2,afade=t=out:st=${expectedDuration - 3}:d=3,aformat=channel_layouts=stereo`,
  "-c:a",
  "pcm_s24le",
  musicPath
]);
run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=1600:sample_rate=48000:duration=0.06",
  "-af",
  "afade=t=out:st=0:d=0.06,aformat=channel_layouts=stereo",
  "-c:a",
  "pcm_s24le",
  clickPath
]);

const ffmpegInputs = ["-i", rawVideoPath, "-i", voiceoverPath, "-i", musicPath, "-i", clickPath];
for (const captionPath of captionPaths) {
  ffmpegInputs.push("-loop", "1", "-framerate", "1", "-i", captionPath);
}
const filterParts = ["[0:v]fps=30,format=yuv420p[base0]"];
for (const [index, cue] of subtitleCues.entries()) {
  filterParts.push(`[${index + 4}:v]format=rgba[caption${index}]`);
  filterParts.push(
    `[base${index}][caption${index}]overlay=0:0:enable='between(t,${cue.start},${cue.end})'[base${index + 1}]`
  );
}
filterParts.push(`[base${subtitleCues.length}]scale=in_range=full:out_range=limited,format=yuv420p,setparams=range=limited[video]`);
const finalVideoLabel = "[video]";

const clickTimesMs = [15000, 32000, 53000, 72000, 92000, 110000, 127000];
const clickLabels = clickTimesMs.map((_, index) => `[click${index}]`).join("");
filterParts.push(`[1:a]volume=-3dB[voice]`);
filterParts.push(`[2:a]volume=-24dB[music]`);
filterParts.push(`[3:a]volume=-16dB,aformat=channel_layouts=stereo,asplit=${clickTimesMs.length}${clickTimesMs.map((_, index) => `[clicksrc${index}]`).join("")}`);
for (const [index, delayMs] of clickTimesMs.entries()) {
  filterParts.push(`[clicksrc${index}]adelay=${delayMs}|${delayMs}[click${index}]`);
}
filterParts.push(
  `[voice][music]${clickLabels}amix=inputs=${clickTimesMs.length + 2}:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9[audio]`
);

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
  "[audio]",
  "-t",
  String(expectedDuration),
  "-c:v",
  "libx264",
  "-profile:v",
  "high",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-c:a",
  "aac",
  "-ar",
  "48000",
  "-ac",
  "2",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  finalVideoPath
]);

run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  finalVideoPath,
  "-map",
  "0:v:0",
  "-c:v",
  "copy",
  "-an",
  "-movflags",
  "+faststart",
  captionsOnlyPath
]);

const probe = JSON.parse(
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels",
    "-of",
    "json",
    finalVideoPath
  ]).stdout
);
const duration = Number(probe.format?.duration);
const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.1 || duration >= 180) {
  fail(`Final duration must be ${expectedDuration}s and under 180s; got ${duration}s.`);
}
if (videoStream?.codec_name !== "h264" || videoStream?.profile !== "High") {
  fail(`Final video must be H.264 High Profile; got ${videoStream?.codec_name} ${videoStream?.profile}.`);
}
if (videoStream?.width !== 1920 || videoStream?.height !== 1080 || videoStream?.pix_fmt !== "yuv420p") {
  fail(
    `Final picture must be 1920x1080 yuv420p; got ${videoStream?.width}x${videoStream?.height} ${videoStream?.pix_fmt}.`
  );
}
if (videoStream?.r_frame_rate !== "30/1") fail(`Final video must be 30 fps; got ${videoStream?.r_frame_rate}.`);
if (audioStream?.codec_name !== "aac" || Number(audioStream?.sample_rate) !== 48000 || audioStream?.channels !== 2) {
  fail(
    `Final audio must be AAC 48 kHz stereo; got ${audioStream?.codec_name} ${audioStream?.sample_rate} Hz ${audioStream?.channels} channels.`
  );
}

const loudnessLog = run("ffmpeg", [
  "-hide_banner",
  "-nostats",
  "-i",
  finalVideoPath,
  "-af",
  "ebur128=peak=true",
  "-f",
  "null",
  "-"
]).stderr;
const loudnessMatches = [...loudnessLog.matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
const peakMatches = [...loudnessLog.matchAll(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)];
const integratedLufs = Number(loudnessMatches.at(-1)?.[1]);
const truePeakDbfs = Number(peakMatches.at(-1)?.[1]);
if (!Number.isFinite(integratedLufs) || integratedLufs < -16 || integratedLufs > -14) {
  fail(`Integrated loudness must be between -16 and -14 LUFS; got ${integratedLufs}.`);
}
if (!Number.isFinite(truePeakDbfs) || truePeakDbfs >= -1) {
  fail(`True peak must be below -1 dBFS; got ${truePeakDbfs}.`);
}

const metadata = {
  kind: "clawdeals-demo-video-v2",
  proof_layer: "LOCAL",
  publication_status: "NOT_PUBLISHED",
  title: "ClawDeals — Shopping agents you can actually trust",
  duration_seconds: Number(duration.toFixed(3)),
  video: {
    codec: videoStream.codec_name,
    profile: videoStream.profile,
    width: videoStream.width,
    height: videoStream.height,
    fps: 30,
    pixel_format: videoStream.pix_fmt
  },
  audio: {
    codec: audioStream.codec_name,
    sample_rate: Number(audioStream.sample_rate),
    channels: audioStream.channels,
    integrated_lufs: integratedLufs,
    true_peak_dbfs: truePeakDbfs,
    mix: { voice_db: -3, music_db: -24, click_sfx_db: -16 }
  },
  captions: { burned_in: true, cue_count: subtitleCues.length },
  inputs: {
    raw_video_sha256: await sha256(rawVideoPath),
    voiceover_sha256: await sha256(voiceoverPath),
    subtitles_sha256: await sha256(subtitlePath)
  },
  outputs: {
    video: { path: path.relative(repoRoot, finalVideoPath), sha256: await sha256(finalVideoPath) },
    captions_only: { path: path.relative(repoRoot, captionsOnlyPath), sha256: await sha256(captionsOnlyPath) }
  }
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata, null, 2));
