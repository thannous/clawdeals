# Demo video evidence — 26 August 2026

Current video proof for the WebMCP Challenge submission.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Submission ticket: [TI-375](https://linear.app/ti-max/issue/TI-375/hackathon-finaliser-readme-video-et-soumission-devpost)

## Current status

| Property | Value |
| --- | --- |
| Durable upload path | `submission-assets/webmcp-challenge/clawdeals-webmcp-demo-final.mp4` |
| Generated source path | `test-results/hackathon-video/clawdeals-webmcp-demo-final.mp4` |
| Local file | **PASS — regenerated and independently probed on 30 August 2026** |
| Publication status | **PUBLIC — verified 30 August 2026** |
| Duration | `160.000000` seconds |
| Video | H.264, 1920×1080 |
| Audio | AAC, 48 kHz, stereo |
| Size | `7,025,623` bytes |
| SHA-256 | `ee591d843231215d28ff93a64ca806a59d3a559b4ab9c322009e525b1bd34693` |
| YouTube URL | https://youtu.be/mjNd6BNk_0U |
| Devpost attachment | **PASS — embedded in saved 4/5 draft; not submitted** |

The source script and subtitles are versioned in `docs/hackathon/DEMO_SCRIPT.md` and `docs/hackathon/DEMO_SUBTITLES.srt`. The current artifact was regenerated on 30 August from a passing deterministic 17-shot capture (1/1), the 16-cue Daniel voiceover at 155 WPM and the subtitle file. `capture:hackathon:all` now copies the upload assets and a hash manifest into the ignored `submission-assets/webmcp-challenge/` directory, which is not cleared by later Playwright runs. `ffprobe`, `shasum -a 256` and the hero, policy-fit search and redacted-receipt frames were independently re-inspected. The search beat also proves that the structured result survives the 1,500-byte WebMCP output cap instead of falling back to a truncated error payload.

## Boundary

The local probe proves the uploadable file and its media contract. YouTube
Studio recorded the video as public on 30 August 2026; the official oEmbed
endpoint returned the expected title and channel, and the anonymous watch URL
returned HTTP 200. Devpost embeds the video in the saved project preview. These
checks do not prove final Devpost submission.

## Public upload package — sent and verified

Suggested title:

> ClawDeals — Your Agent Negotiates. You Stay in Control. | WebMCP Challenge

Suggested description:

```text
ClawDeals is the trust layer for delegated commerce: agents search and negotiate while humans define the limits and keep the final say.

This 160-second WebMCP Challenge demo shows a deterministic synthetic journey: Deal Mission, policy-fit search, structured negotiation, server-enforced budget protection, editable owner approval, atomic reservation, bilateral contact consent and a redacted action receipt.

Live judge hub: https://clawdeals.com/webmcp-challenge
Authenticated synthetic sandbox: https://sandbox.clawdeals.com/webmcp-challenge
Public repository: https://github.com/thannous/clawdeals
Challenge-period changes: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/WHAT_CHANGED.md
Reproduction and evidence: https://github.com/thannous/clawdeals/blob/main/HACKATHON.md

ClawDeals existed before the challenge. The repository baseline tag and dated ledger separate prior work from the WebMCP extension built during the competition.

The full mutation sequence shown in the video runs only against isolated synthetic sandbox data. Production keeps the judge reset disabled.

Synthetic listing photography is served by Lorem Picsum from Unsplash and used under the Unsplash License: https://unsplash.com/license
Photo credits: Drew Patrick Miller (https://unsplash.com/photos/VLT62-JzddA), Greg Shield (https://unsplash.com/photos/v9eNihIWh8k), Patryk Sobczak (https://unsplash.com/photos/9VPtNW84vGI), Fré Sonneveld (https://unsplash.com/photos/Bpb6yvtkpEY), Kelley Bozarth (https://unsplash.com/photos/n6vS3xlnsCc).
```

Upload settings:

- visibility: `Public`;
- audience: `No, it is not made for kids`;
- category: `Science & Technology`;
- language: English;
- tags: `WebMCP`, `AI agents`, `agentic commerce`, `Next.js`, `OpenAI`,
  `hackathon`, `human in the loop`.

Prepared 1920×1080 thumbnail: `submission-assets/webmcp-challenge/frames/00-hero.jpg`
with SHA-256
`7e11c235f3faea69a0d1d27a88a6bd54abe9042ffe8640229e4e310cd15f678a`.
The two prepared gallery frames and their accessible descriptions are indexed in
[`DEVPOST_SUBMISSION_DRAFT.md`](./DEVPOST_SUBMISSION_DRAFT.md#prepared-submission-media--local-only).

## Media rights check

- audio is the locally rendered macOS `Daniel` voiceover; the video contains no
  music;
- the ClawDeals interface, captions and motion assembly are repository-owned;
- the five deterministic listing images resolve through Lorem Picsum to the
  exact credited Unsplash sources above; the [Unsplash
  License](https://unsplash.com/license) permits commercial and non-commercial
  reuse;
- the selected hero thumbnail contains no listing photograph; the search gallery
  frame includes the licensed sources and the receipt frame is primarily product
  UI;
- recheck the final uploaded file and metadata for unintended third-party marks
  before publication. This inventory records provenance; it is not a claim that
  a local file equals a public upload.

Uploading the file, saving metadata and publishing are external actions. Confirm
them at action time, then verify the final URL in a signed-out window before
changing `Publication status` or attaching it to Devpost.
