---
name: hackathon-video
description: Capture, re-narrate, assemble or verify the ClawDeals WebMCP Challenge demo video.
---

# ClawDeals demo video

Read the [current V2 brief](../../../docs/hackathon/DEMO_VIDEO_V2.md) for its 138-second timeline, Cillian voice, output contract and commands. Publication notes in that brief are historical evidence; reverify the destination before claiming current availability.

## Boundaries and prerequisites

- Follow [package.json](../../../package.json) engine requirements. Check the installed Playwright binary, Node/npm, ffmpeg and ffprobe. macOS `say` is needed only for the legacy Daniel voice.
- Capture synthetic judge/sandbox data only. No production mutation or real contact data; restore fixture changes and preserve unrelated assets.
- Confirm the selected version before overwriting existing output. Reuse approved voice assets when appropriate; paid generation needs authorization.
- Finish with media metadata checks and visual/audio review. Upload and submission need separate authorization and direct evidence; local packaging does not prove publication.

## Current V2

Run the stages needed for the task from the repository root, after checking the brief's prerequisites:

```bash
npm run capture:hackathon:v2:video
npm run capture:hackathon:v2:voiceover
npm run capture:hackathon:v2:assemble
npm run capture:hackathon:v2:package
```

The full `capture:hackathon:v2:all` pipeline also includes production-frame capture; inspect its read-only scope and authorization before choosing it. Do not regenerate every stage for a metadata-only check.

## Legacy reproduction

Only when reproducing the original 160-second Daniel video, read [DEMO_SCRIPT.md](../../../docs/hackathon/DEMO_SCRIPT.md), [subtitles](../../../docs/hackathon/DEMO_SUBTITLES.srt), [capture](../../../e2e/capture/webmcp-victory.capture.ts) and [assembly](../../../scripts/assemble-hackathon-video.mjs). Its commands are `capture:hackathon:video`, `capture:hackathon:voiceover`, `capture:hackathon:assemble` and `capture:hackathon:package` (or `capture:hackathon:all`).

Legacy output: `submission-assets/webmcp-challenge/clawdeals-webmcp-demo-final.mp4`. The earlier Cillian preview is at `submission-assets/webmcp-challenge/cillian-preview/DAY_CLAWDEALS_WEBMCP_CILLIAN_01_DRAFT_16x9.mp4`; it is not the V2 package.

## Verification

Use `ffprobe -v error -show_format -show_streams -print_format json <selected-video>` for duration/codecs, and `ffmpeg -i <selected-video> -af "ebur128=peak=true" -f null -` for loudness. Replace the placeholder with the chosen artifact. Check 1080p/30fps H.264, AAC 48kHz stereo, the selected brief's exact duration, -16 to -14 LUFS and true peak below -1 dBFS. Review captions, timing, legibility and audible quality separately.
