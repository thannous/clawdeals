# Judge guide

How to evaluate ClawDeals for the WebMCP Challenge without rebuilding the product.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`


## Understand this in 15 seconds

ClawDeals is not "a marketplace with extra tools".

It is a browser-native trust layer for delegated commerce:

| Actor | Role |
| --- | --- |
| Agent | Searches, ranks, asks, offers, and negotiates through WebMCP |
| Owner | Sets the mission, edits sensitive amounts, and keeps the last word |
| ClawDeals | Enforces policy server-side, reserves listings atomically, requires bilateral contact consent, and emits a redacted receipt |

Pitch: **a marketplace where agents can negotiate a real deal without owners giving up budget, identity, or contact control.**

Official contest samples already cover catalogues and carts. The judged differentiators are multiparty negotiation, policy stop, editable human approval, atomic reservation, bilateral consent, and audit.

## Where to start

| Surface | URL / path | Purpose |
| --- | --- | --- |
| Judge hub | `/webmcp-challenge` | Compatibility, exact registered tools, copyable mission, isolated reset |
| Live marketplace | `/webmcp` | Real product surface, not a simulator. The hub launch button opens this page |
| Production hub | https://clawdeals.com/webmcp-challenge | Contains the reviewed production runtime; native Codex guest proof remains historical on `2ed489d`. Production reset stays closed. |
| Authenticated sandbox | https://sandbox.clawdeals.com/webmcp-challenge | Vercel runtime `deb00e3`; HTTP, reset and injected eleven-tool buyer/seller journey PASS. Use only synthetic judge credentials supplied privately. |
| Eligibility ledger | `HACKATHON.md` | Baseline SHA, challenge-period commits, registry |

The hub reports the browser's real `document.modelContext` support, the tools that actually registered, and a sanitized deploy SHA when the host provides one. Missing native WebMCP is `INDETERMINATE`, not a product fail.

## Copy this mission

The hub copies this exact prompt:

> Create a BUY mission for a used e-bike within 25 km of Paris. My preferred price is 1,200 EUR, my hard budget is 1,300 EUR, and battery health must be at least 80%. Search and rank the matching listings, explain every policy_fit, then open the best candidate. Start a negotiation thread, ask the seller to confirm battery health and service history, and prepare an offer of 1,100 EUR. Stop for my confirmation whenever ClawDeals requires it; never reveal contact details without bilateral approval.

## Deterministic fixtures

Judge reset (`POST /api/v1/sandbox/reset` with `mode=webmcp_challenge`) is allowlisted to `WEBMCP_JUDGE_AGENT_ID` and exists only when `CLAWDEALS_ENV=sandbox`. Production must return `404`. A non-judge agent gets `403`.

Reset creates only synthetic data:

- one BUY mission (preferred 1,200 EUR, hard budget 1,300 EUR, 25 km of Paris, battery health >= 80%);
- one dedicated synthetic seller;
- five stable e-bikes: target fit 1,150; preferred-over 1,240; hard-budget 1,420; battery-low 980; out-of-radius 1,100;
- one negotiation thread and one system message;
- no real email, phone, or contact identity.

Two authorized resets keep the same synthetic actors, listing IDs, and thread ID. Reset clears stale local mission/receipt state and does not clear the stored judge key.

## Suggested path (under 10 minutes)

Judges are not required to build the repo. If a live WebMCP browser is available:

1. Open `/webmcp-challenge` in a clean profile.
2. Confirm native `document.modelContext` or record `INDETERMINATE`.
3. Without a key, record the five public tools.
4. Connect the allowlisted judge agent on an isolated sandbox host only. Reset. Record the eleven authenticated tools.
5. Paste the copyable mission. First write should be `create_buy_mission`.
6. Watch `search_listings` rank with `policy_fit` issues, then `open_listing` on the best eligible candidate.
7. `start_thread` + `send_message` (seller text is untrusted data).
8. `make_offer` at 1,100 EUR stops for editable confirmation.
9. Force a policy stop: a counter or accept above 1,300 EUR returns `APPROVAL_REQUIRED` / `hard_budget_exceeded` instead of bypassing the mission.
10. Resolve the owner approval on `/my/approvals/:id` only. Agents cannot call `resolve_approval` from browse or the challenge page.
11. Seller `respond_to_offer` `accept` reserves the listing (`RESERVED`).
12. `request_contact_reveal` creates two independent owner consents. One consent reveals nothing.
13. `get_action_receipt` shows a redacted receipt. Agent Activity on the page should match that receipt.

If the browser has no WebMCP, follow the [demo script](./DEMO_SCRIPT.md). A
160-second 1080p H.264/AAC MP4 is present in the current workspace and was
independently verified on 29 August. The public YouTube file is **not
published**.

## What must not happen

- A read tool silently gaining write scope.
- An agent resolving an owner approval with its own key.
- Contact details appearing before both owners consent.
- Secrets, emails, or phones in tool output or receipts.
- Automatic retry after `OUTCOME_UNKNOWN` (`safe_to_retry: false`).
- Treating Playwright's mocked `document.modelContext` as ChatGPT or Chrome proof.

## Local reproduction (optional)

Do not use production project `gztfmpuqtpvncdcuhqxy` or production secrets.

```bash
nvm use
npm ci
cp .env.example .env.local
# fill only local isolated values, then:
npm run release:hackathon:preflight
npm run release:hackathon:local
```

Journey and security stages need the isolated sandbox in `docs/sandbox-getting-started.md`. Details: `docs/hackathon/release-candidate-runbook.md`.

## Proof layers

| Layer | Status | What this file may cite |
| --- | --- | --- |
| LOCAL release candidate | PASS on reviewed runtime `60b99f7` | Typecheck, lint, 381 Vitest files / 2,668 passed / 1 skipped, complete Supabase reset, journey 2/2, security 10/10 and final capture 1/1 passed. |
| CI | Last green `9e7102e`; current **WAIVED / NOT RUN** | Last actually green remote CI is [`CI` run 32980551636](https://github.com/thannous/clawdeals/actions/runs/32980551636) on `9e7102e`. Current HEAD remote CI is waived / not run. |
| DEPLOYED / PUBLIC HTTP | PASS for runtime `60b99f7` through a documentation descendant | The live judge hub returns 200 with `Origin-Agent-Cluster: ?1`, public listings return 200, and production reset remains 404. Production database migration state remains separate. |
| PUBLIC native guest | PASS on `2ed489d5a508` | Codex in-app discovered the five public tools and executed context → search → cross-route redacted receipt without returning to the hub. Request IDs: context `8d6975ba-279d-4c42-aaad-914225764fd0`, search `ec572532-5994-4145-96e9-2095d592e666`, receipt-read `df16a0fb-2cc6-4619-9989-12fcb652a802`. |
| PUBLIC authenticated sandbox | PASS on `deb00e3` | Authenticated verifier plus Playwright buyer/seller journey: eleven tools, deterministic reset, mission, 1,150 EUR offer, atomic acceptance, redacted receipt and idempotent replay. Explicit compatibility injection; not native Chrome/ChatGPT proof. |
| CHROME | INDETERMINATE | Connected Chrome loaded the deployed build without an active WebMCP runtime. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| VIDEO LOCAL | PASS / CURRENT FILE PRESENT | The 160-second H.264 1080p + AAC artifact exists locally; SHA-256 `ed2372ac304cdb81527c1da97d8b71e199e4153c24612b2a9dad07c39961315d`. |
| VIDEO PUBLIC / DEVPOST | NOT PROVEN | Public YouTube and Devpost submission are not proven. |

Exact links and boundaries: [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md). Do not treat HTTP or injected authenticated proof as native Chrome/ChatGPT WebMCP selection or Devpost acceptance.
