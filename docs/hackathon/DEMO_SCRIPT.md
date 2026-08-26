# Demo script (under 3 minutes)

Narration and picture for the WebMCP Challenge video. Target length **2 minutes 40 seconds**. Must stay under 3 minutes, include clear audio, and show the real product in the first 15 seconds.

The public YouTube upload is **not published**. This file is the script, not PUBLIC or DEVPOST proof.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`


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

> Search ranks five synthetic bikes. Only policy_fit tells the truth: one is in budget, one is over my target, one blows the hard cap, one fails battery, one is outside Paris.

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
- `policy.limit` 1300
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
| LOCAL | PASS on the pre-doc candidate | Root validation ran a clean clone of `efd6310fd8e875b08d00aa0519386db83e8a474f`: migrations + seed, 373 Vitest files / 2,616 passed / 1 skipped, build 110 pages, selector 24 x 3, contracts 79/79, UI 5/5, journey 2/2, security 10/10. The final reviewed SHA must rerun the gate after these docs are committed; its exact result belongs in TI-376 because embedding that SHA here would change it. |
| CI | NOT PROVEN | GitHub Actions on the judged SHA is pending in the TI-376 runbook. |
| DEPLOYED | NOT PROVEN | `https://clawdeals.com/webmcp-challenge` is the intended route. README states deployment of the reviewed SHA is still pending. |
| PUBLIC | NOT PROVEN | Private-window / incognito smoke is pending. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| DEVPOST | NOT PROVEN | Submission, public video, and freeze are pending. |

Do not treat a local test pass as CI, deployment, public smoke, ChatGPT tool selection, or Devpost acceptance.
