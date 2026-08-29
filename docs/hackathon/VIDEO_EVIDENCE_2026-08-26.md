# Demo video evidence — 26 August 2026

Current video proof for the WebMCP Challenge submission.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Submission ticket: [TI-375](https://linear.app/ti-max/issue/TI-375/hackathon-finaliser-readme-video-et-soumission-devpost)

## Current status

| Property | Value |
| --- | --- |
| Local path | `test-results/hackathon-video/clawdeals-webmcp-demo-final.mp4` |
| Local file | **PASS — regenerated and independently probed on 29 August 2026** |
| Publication status | **NOT_PUBLISHED** |
| Duration | `160.000000` seconds |
| Video | H.264, 1920×1080 |
| Audio | AAC, 48 kHz, stereo |
| Size | `7,021,649` bytes |
| SHA-256 | `ed2372ac304cdb81527c1da97d8b71e199e4153c24612b2a9dad07c39961315d` |
| YouTube URL | None |
| Devpost attachment | None |

The source script and subtitles are versioned in `docs/hackathon/DEMO_SCRIPT.md` and `docs/hackathon/DEMO_SUBTITLES.srt`. The current artifact was regenerated from a passing deterministic 17-shot capture, the 16-cue Daniel voiceover at 155 WPM and the subtitle file. `ffprobe`, `shasum -a 256` and representative frames at the hero, search, approval, consent, receipt and close beats were independently inspected. The search beat also proves that the structured result survives the 1,500-byte WebMCP output cap instead of falling back to a truncated error payload.

## Boundary

The current local probe proves an uploadable file and its media contract. It
does not prove a YouTube upload, public anonymous playback, Devpost attachment
or final submission. Recheck the exact hash immediately before upload. A
Devpost draft or the script is not publication proof.

## Public upload package — prepared, not sent

Suggested title:

> ClawDeals — Your Agent Negotiates. You Stay in Control. | WebMCP Challenge

Suggested description:

```text
ClawDeals is the trust layer for delegated commerce: agents search and negotiate while humans define the limits and keep the final say.

This 160-second WebMCP Challenge demo shows a deterministic synthetic journey: Deal Mission, policy-fit search, structured negotiation, server-enforced budget protection, editable owner approval, atomic reservation, bilateral contact consent and a redacted action receipt.

Live judge hub: https://clawdeals.com/webmcp-challenge
Public repository: https://github.com/thannous/clawdeals
Challenge-period changes: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/WHAT_CHANGED.md
Reproduction and evidence: https://github.com/thannous/clawdeals/blob/main/HACKATHON.md

ClawDeals existed before the challenge. The repository baseline tag and dated ledger separate prior work from the WebMCP extension built during the competition.

The full mutation sequence shown in the video runs only against isolated synthetic sandbox data. Production keeps the judge reset disabled.
```

Upload settings:

- visibility: `Public`;
- audience: `No, it is not made for kids`;
- category: `Science & Technology`;
- language: English;
- tags: `WebMCP`, `AI agents`, `agentic commerce`, `Next.js`, `OpenAI`,
  `hackathon`, `human in the loop`.

Uploading the file, saving metadata and publishing are external actions. Confirm
them at action time, then verify the final URL in a signed-out window before
changing `Publication status` or attaching it to Devpost.
