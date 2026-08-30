# Demo script (under 3 minutes)

Narration and picture for the WebMCP Challenge video. Target length **2 minutes 40 seconds**. Must stay under 3 minutes, include clear audio, and show the real product in the first 15 seconds.

The public upload is available at https://youtu.be/mjNd6BNk_0U. This file remains the narration and shot script; publication proof is recorded separately.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`
- Timed English captions: [`DEMO_SUBTITLES.srt`](./DEMO_SUBTITLES.srt)

Local deterministic capture, macOS voiceover, final assembly and durable ignored upload package:

```bash
npm run capture:hackathon:all
```

Generated intermediates stay in `test-results/hackathon-video/`; upload assets
and their manifest are copied to `submission-assets/webmcp-challenge/` so later
Playwright runs cannot delete the final package.

The capture uses only the isolated WebMCP judge sandbox. It records at 1920 × 1080,
encodes deterministic shots from the real browser journey, mixes the timed voiceover
and captions, validates a 160-second audio/video result, and marks the metadata
`LOCAL` / `NOT_PUBLISHED`.


## Before recording

- Isolated sandbox only. Never production data or real contacts.
- Start already on `/webmcp` with the judge agent connected and fixtures reset.
- Do not type the prompt live. Paste, or start after `create_buy_mission` has been issued.
- Keep Agent Activity visible.
- If native WebMCP is unavailable in the recording browser, say so and show the registered-tool inspector plus confirmation UI. Do not imply ChatGPT selected the tools.

Judge prompt (also on `/webmcp-challenge`):

> Create a BUY mission for a used e-bike within 25 km of Paris. My preferred price is 1,200 EUR, my hard budget is 1,300 EUR, and battery health must be at least 80%. Search and rank the matching listings, explain every policy_fit, then open the best candidate. Start a negotiation thread, ask the seller to confirm battery health and service history, and prepare an offer of 1,100 EUR. Stop for my confirmation whenever ClawDeals requires it; never reveal contact details without bilateral approval.

## 0:00-0:12 — problem and result

Voice:

> Shopping agents already search and fill carts. Real deals need negotiation, hard limits, consent, and a receipt.

Picture: marketplace, mission panel filling, first Agent Activity row for `create_buy_mission`. No logo sting.

On-screen line: **Your agent negotiates. You stay in control.**

## 0:12-0:35 — mission

Voice:

> I delegate a BUY mission: used e-bike, 25 km of Paris, prefer 1,200 EUR, hard cap 1,300, battery at least 80 percent. Contact reveal stays manual and bilateral.

Picture:

- `create_buy_mission` confirmation if shown;
- structured mission: preferred 1,200 / hard 1,300 / radius 25 / `manual_bilateral_approval`;
- human and agent looking at the same panel.

## 0:35-1:00 — search and rank

Voice:

> The sandbox compares five synthetic bikes. Search highlights the four within radius. The visible policy edges are deliberate: one is in budget, one is over my target, one blows the hard cap, one fails battery, one is outside Paris.

Picture: `search_listings` then `open_listing` on the 1,150 EUR target-fit bike (battery 88%, inside radius). Grid highlights the same IDs. No emails.

| Fixture | Price | Why it ranks that way |
| --- | --- | --- |
| Target fit | 1,150 | Eligible |
| Preferred-over | 1,240 | Above 1,200, under 1,300 |
| Hard-budget | 1,420 | `price_above_hard_budget` |
| Battery-low | 980 | Requirement needs seller confirmation / battery < 80% |
| Out-of-radius | 1,100 | Outside 25 km |

## 1:00-1:22 — negotiation

Voice:

> The agent opens a thread and asks for battery health and service history. Seller text is untrusted data. Then it prepares 1,100 EUR, inside policy, and still stops for my confirmation.

Picture:

- `start_thread`, `send_message`;
- `make_offer` 1,100 EUR;
- editable confirmation modal, not a raw JSON blob.

## 1:22-1:40 — policy block and human approval

Voice:

> When the other side pushes above 1,300 EUR, ClawDeals does not let the agent accept. It creates an owner approval. I edit the amount to 1,290 and approve.

Picture:

- `APPROVAL_REQUIRED` / `hard_budget_exceeded`;
- owner sheet on `/my/approvals/:id`;
- edited amount 1,290;
- Agent Activity shows denied-or-pending then human_approved.

Do not show `resolve_approval` on the public browse page. That tool is owner-page only.

## 1:40-2:00 — atomic reservation and bilateral consent

Voice:

> The seller accepts. The listing flips to RESERVED in one step, other offers drop, and still nobody sees a phone number. Contact reveal needs both owners. One consent reveals nothing.

Picture:

- `respond_to_offer` accept;
- listing status `RESERVED`;
- `request_contact_reveal` with two independent consents;
- still-redacted contacts after the first approval.

## 2:00-2:22 — receipt

Voice:

> Every protected action leaves a receipt: request ID, hash of redacted inputs, policy limit, approval IDs, outcome. The agent can reread it. Secrets and personal data are already gone.

Picture: Agent Activity + `get_action_receipt`.

Call out:

- `receipt_version: "1"`
- `tool.name` (`respond_to_offer` or `make_offer`)
- `input_hash`
- `result.details.hard_budget_max` 1300 on the blocked action
- `outcome: success`
- no email, phone, or API key

## 2:22-2:40 — architecture close

On screen:

```text
contextual document.modelContext tools
+ server-enforced mission policy
+ editable human approval
+ atomic reservation
+ bilateral contact consent
+ redacted receipts
```

Voice:

> ClawDeals turns WebMCP into a safe collaboration protocol for real-world commerce. Your agent negotiates. You stay in control.

Hard cut. No extra features, escrow, or Telegram.

## Shot checklist

| Beat | Tool / UI | Must show | Must not show |
| --- | --- | --- | --- |
| Mission | `create_buy_mission` | hard cap 1,300 | production PII |
| Search | `search_listings` | `policy_fit` | 30-field API dump |
| Talk | `start_thread` / `send_message` | untrusted seller copy | agent following injected instructions |
| Offer | `make_offer` 1,100 | confirmation | silent write |
| Policy | hard budget stop | `APPROVAL_REQUIRED` | agent self-approving |
| Human | owner approval 1,290 | editable amount | JSON-only dialog as the whole UX |
| Reserve | `respond_to_offer` accept | `RESERVED` | second listing remaining active |
| Consent | `request_contact_reveal` | two consents, first one empty | emails before both approvals |
| Audit | `get_action_receipt` | hash + outcome | secrets |

## Proof layers

| Layer | Status | What this file may cite |
| --- | --- | --- |
| LOCAL | PASS on the reviewed implementation | The clean committed `2ed489d` gate passed typecheck, lint, 377 Vitest files / 2,634 passed / 1 skipped, a 109-page build, selector 24 x 3, contracts 82/82, UI 6/6, journey 2/2 and security 10/10. See [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md). |
| CI | PASS on submission-evidence SHA `d737312` | GitHub [`CI` run 33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103) passed all jobs. |
| DEPLOYED / PUBLIC HTTP | PASS | The reviewed implementation was deployed; the public challenge and browse routes return 200 with `Origin-Agent-Cluster: ?1`, public listings return 200 and the production sandbox reset remains 404. Later documentation-only descendants may display a newer deploy SHA without changing the reviewed runtime. |
| PUBLIC native guest / authenticated sandbox | Guest PASS in Codex; authenticated injected journey PASS on `deb00e3` | Codex in-app discovered and executed the five guest tools. Separately, the isolated sandbox passed the eleven-tool buyer/seller journey under explicit Playwright compatibility injection; this is not native Chrome or ChatGPT proof. |
| CHROME | INDETERMINATE | The tested Chrome profile exposed no `document.modelContext`; this is neither a product pass nor a fail. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| VIDEO / DEVPOST | VIDEO PUBLIC PASS; DEVPOST DRAFT 4/5 | The 160-second 1080p video is public and anonymously reachable. Devpost is saved and previewed but not submitted; post-submission freeze remains pending. |

Do not treat a local test pass as CI, deployment, public smoke, ChatGPT tool selection, or Devpost acceptance.
