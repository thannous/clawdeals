# ClawDeals demo video V2

Production brief for **ClawDeals — Shopping agents you can actually trust**.

## Output contract

- Duration: exactly 138 seconds (2:18), below the 3-minute submission limit.
- Picture: 1920 × 1080, 16:9, 30 fps progressive, H.264 High Profile.
- Audio: AAC 48 kHz stereo, 192 kbps, integrated loudness between -16 and -14 LUFS, true peak below -1 dBFS.
- Language: English with burned-in English captions.
- Voice: Cillian preset, warm and confident founder delivery, neutral international English.
- Music: subtle generated electronic bed without vocals; short click accents at scene cuts.
- Data: real product UI against the isolated sandbox. No production mutation and no real contact data.

The previous 160-second published video remains unchanged. V2 is packaged separately under
`submission-assets/webmcp-challenge/demo-video-v2/` and is marked `NOT_PUBLISHED` until a human
reviews it.

## Timeline

| Time | Scene | Product proof |
| --- | --- | --- |
| 00:00–00:15 | Proof first | €1,150 bicycle listing, gallery and one-click `Ask my agent` prefill |
| 00:15–00:32 | Agent action | Prepared BUY mission, confirmation and structured mission result |
| 00:32–00:53 | Policy control | €1,000 hard ceiling, €1,150 blocked, compliant offer accepted |
| 00:53–01:12 | Marketplace | Grid, second gallery image, Paris · FR, map and same-market alternatives |
| 01:12–01:32 | Price alert | Connected Follow, `/my/watchlists`, verified sandbox `listing_price_drop` queue event |
| 01:32–01:50 | WebMCP | Discoverable tools, structured receipt and localized French guidance |
| 01:50–02:07 | Auditability | Owner policy decision history and request receipt |
| 02:07–02:18 | Closing | Three-panel product montage, logo and public URL |

## Capture rules

- Start authenticated as the synthetic judge owner with its connected agent.
- Configure the owner policy before recording: €1,000 hard ceiling and approval above €900.
- Preload state; never show sign-up, onboarding, live typing, loading states or real identifiers.
- Capture each scene as deterministic still beats and use hard jump cuts.
- The price-drop scene may mutate only the sandbox fixture and must restore its original price.
- Any queue annotation must be backed by a database assertion in the capture test.

## Narration

The timed narration and burned-in captions are versioned in
[`DEMO_VIDEO_V2_SUBTITLES.srt`](./DEMO_VIDEO_V2_SUBTITLES.srt). The exact accepted TTS job ledger
is written into the generated package manifest.

## Commands

```bash
npm run capture:hackathon:v2:video
npm run capture:hackathon:v2:voiceover
npm run capture:hackathon:v2:assemble
npm run capture:hackathon:v2:package
```

Or run the full pipeline:

```bash
npm run capture:hackathon:v2:all
```
