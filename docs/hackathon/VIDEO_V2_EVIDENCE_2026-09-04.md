# Demo video V2 evidence — 2026-09-04

## Result

- Title: `ClawDeals — Shopping agents you can actually trust`
- Duration: exactly 138 seconds (`02:18`)
- Publication status: `PUBLIC`
- Public video: `https://youtu.be/ePgP4IO_qM8`
- Previous video: `UNLISTED` at `https://youtu.be/mjNd6BNk_0U`
- Final SHA-256: `2d316d578f752e41117bf5b690d6b15834ce59d3b9ab53265994e86ba36dd173`
- Public reference: `https://clawdeals.com`, deployed SHA `d435d77950fe89a3c9143d0cd527a8c6fb14df4d`

## Evidence boundary

Nine read-only frames come directly from production: listing, mission prefill, marketplace grid,
gallery, location, similar listings, English WebMCP, French WebMCP, and the closing landing page.
All mutable proof uses the isolated local sandbox: mission creation, policy enforcement, offer,
server-side follow, price-drop queue, activity result, policy history, and receipt. Production data
was not changed.

## Media validation

| Property | Verified value |
| --- | --- |
| Video | H.264 High, 1920 × 1080, 30 fps, yuv420p |
| Audio | AAC LC, 48 kHz, stereo, 192 kbps target |
| Loudness | -14.9 LUFS integrated, -2.5 dBFS true peak |
| Captions | 18 English cues burned into picture |
| Voice | Cillian preset, eight fixed-window takes |
| Mix | voice -3 dB, music -24 dB, click -16 dB |

Scenes 4 and 6 fit their windows without internal pauses but retain Cillian's measured
2.07-words-per-second delivery after bounded retries.

## Executed checks

- Complete sandbox capture: 1 Playwright test passed; 20 shots total exactly 138 seconds.
- Production frame capture: 9 read-only screenshots from `https://clawdeals.com`.
- TypeScript: `npm run typecheck` passed.
- Targeted ESLint: all V2 capture and assembly sources passed.
- Final FFprobe and EBU R128 assertions passed inside the assembler.
- Contact-sheet inspection covered all eight scenes and the burned-in captions.
- YouTube Studio reported no copyright issues before publication.
- The public YouTube watch page loaded the expected title and a `02:18` player on 4 September.

## Package

The local package is stored under `submission-assets/webmcp-challenge/demo-video-v2/`. It includes
the narrated final video, captions-only backup, WAV voiceover, SRT file, representative frames,
capture metadata, voice ledger, media metadata, and a checksummed manifest.
