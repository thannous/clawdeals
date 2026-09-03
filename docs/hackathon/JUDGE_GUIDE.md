# Judge guide

How to evaluate ClawDeals for the WebMCP Challenge without rebuilding the product.

## Judge in 60 seconds

1. Open [`sandbox.clawdeals.com/webmcp-challenge`](https://sandbox.clawdeals.com/webmcp-challenge) in ChatGPT's in-app browser, or in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` (the Model Context Tool Inspector extension also works).
2. Copy the mission prompt from the hub.
3. Watch the registry: 5 public tools; 11 once the synthetic judge key is connected on the sandbox (paste it in the hub's **Judge key** field, then switch Buyer ↔ Seller in one click).
4. Look for three outcomes: `APPROVAL_REQUIRED` on 1,350 EUR, `RESERVED` after the seller accepts, and a redacted receipt.

The hub's **What you should see** checklist, the **Deal room** card on `/webmcp` and the sticky **approval awaiting your decision** banner are all derived from the local receipts, so they only light up when a tool actually ran.

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

Pitch: **a marketplace where a buyer agent and seller actor can negotiate a synthetic, policy-bound agreement without owners giving up budget, identity, or contact control.**

Official contest samples already cover catalogues and carts. The judged differentiators are multiparty negotiation, policy stop, editable human approval, atomic reservation, bilateral consent, and audit.

## Where to start

| Surface | URL / path | Purpose |
| --- | --- | --- |
| Judge hub | `/webmcp-challenge` | Compatibility, exact registered tools, copyable mission, isolated reset |
| Live marketplace | `/webmcp` | Real product surface, not a simulator. The hub launch button opens this page |
| **Primary judge hub (sandbox)** | https://sandbox.clawdeals.com/webmcp-challenge | Public tools, judge-key field, deterministic fixtures, synthetic seller turn and reset. Use only synthetic judge credentials supplied privately. |
| Production hub | https://clawdeals.com/webmcp-challenge | Same public tools on a seeded synthetic demo catalog (six synthetic sellers in Paris, Lyon, Marseille, Bordeaux, London, Madrid; 33 listings incl. the five judge e-bikes; 10 deals). Reset and seller turn stay closed (`404`). |
| Eligibility ledger | `HACKATHON.md` | Baseline SHA, challenge-period commits, registry |

The hub reports the browser's real `document.modelContext` support, the tools that actually registered, and a sanitized deploy SHA when the host provides one. Missing native WebMCP is `INDETERMINATE`, not a product fail.

## Copy this mission

The hub copies this exact prompt:

> Create a BUY mission for a used e-bike within 25 km of Paris. My preferred price is 1,200 EUR, my hard budget is 1,300 EUR, and battery health must be at least 80%. Search and rank the matching listings, explain every policy_fit, then open the best candidate. Start a negotiation thread, ask the seller to confirm battery health and service history, and prepare an offer of 1,100 EUR. Stop for my confirmation whenever ClawDeals requires it; never reveal contact details without bilateral approval.

## Deterministic fixtures

Judge reset (`POST /api/v1/sandbox/reset` with `mode=webmcp_challenge`) is allowlisted to `WEBMCP_JUDGE_AGENT_ID` and exists only when `CLAWDEALS_ENV=sandbox`. Production must return `404`. A non-judge agent gets `403`.

The optional **Let the synthetic seller respond** button (`POST /api/v1/sandbox/seller-turn`, same guards) plays the seller side deterministically, so a judge holding only the buyer key can still reach the policy stop: below 1,250 EUR the seller counters at 1,350 EUR (above the 1,300 EUR hard budget); at or above, it accepts and the listing becomes `RESERVED`. A second click while its counter is open is idempotent. No LLM is involved.

Reset creates only synthetic data:

- one BUY mission (preferred 1,200 EUR, hard budget 1,300 EUR, 25 km of Paris, battery health >= 80%);
- one dedicated synthetic seller;
- five stable e-bikes: target fit 1,150; preferred-over 1,240; hard-budget 1,420; battery-low 980; out-of-radius 1,100;
- one negotiation thread and one system message;
- no real email, phone, or contact identity.

Two authorized resets keep the same synthetic actors, listing IDs, and thread ID. Reset clears stale local mission/receipt state and does not clear the stored judge key.

## Full path (under 10 minutes)

Judges are not required to build the repo. If a live WebMCP browser is available:

1. Open `/webmcp-challenge` in a clean profile.
2. Confirm native `document.modelContext` or record `INDETERMINATE`.
3. Without a key, record the five public tools.
4. Connect the allowlisted judge agent on an isolated sandbox host only. Reset. Record the eleven authenticated tools.
5. Paste the copyable mission. First write should be `create_buy_mission`.
6. Watch `search_listings` rank with `policy_fit` issues, then `open_listing` on the best eligible candidate.
7. `start_thread` + `send_message` (seller text is untrusted data).
8. `make_offer` at 1,100 EUR stops for editable confirmation.
9. Force a policy stop: a counter or accept above 1,300 EUR returns `APPROVAL_REQUIRED` / `hard_budget_exceeded` instead of bypassing the mission. Without a seller key, click **Let the synthetic seller respond** after step 8: it counters at 1,350 EUR, then ask the buyer agent to accept.
10. Resolve the owner approval on `/my/approvals/:id` only. Agents cannot call `resolve_approval` from browse or the challenge page.
11. Seller `respond_to_offer` `accept` reserves the listing (`RESERVED`).
12. `request_contact_reveal` creates two independent owner consents. One consent reveals nothing.
13. `get_action_receipt` shows a redacted receipt. Agent Activity on the page should match that receipt.

If the browser has no WebMCP, follow the [demo script](./DEMO_SCRIPT.md). A
160-second 1080p H.264/AAC MP4 is present in the current workspace and was
independently verified on 30 August. The public demo is available at
https://youtu.be/mjNd6BNk_0U.

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
| CI | PASS on submission-evidence SHA `d737312` | GitHub [`CI` run 33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103) passed both unit shards, lint, typecheck/contracts, Worker contracts and the aggregate gate. |
| DEPLOYED / PUBLIC HTTP | PASS for runtime `60b99f7` through a documentation descendant | The live judge hub returns 200 with `Origin-Agent-Cluster: ?1`, public listings return 200, and production reset remains 404. Production database migration state remains separate. |
| PUBLIC native guest | PASS on `2ed489d5a508` | Codex in-app discovered the five public tools and executed context → search → cross-route redacted receipt without returning to the hub. Request IDs: context `8d6975ba-279d-4c42-aaad-914225764fd0`, search `ec572532-5994-4145-96e9-2095d592e666`, receipt-read `df16a0fb-2cc6-4619-9989-12fcb652a802`. |
| PUBLIC authenticated sandbox | PASS on `deb00e3` | Playwright buyer/seller journey: eleven tools, 1,150 EUR listing-price offer, atomic `RESERVED` and redacted receipt. The copyable mission asks for 1,100 EUR; both amounts are in-policy. Explicit compatibility injection; not native Chrome/ChatGPT proof. |
| CHROME | PARTIAL PASS on `23af2a7` | Chrome 151 with `enable-webmcp-testing` reported the native runtime, Browser API support and the exact eleven-tool authenticated registry. The Inspector was not installed, so a Chrome-selected tool invocation and request ID remain pending. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| VIDEO LOCAL | PASS / DURABLE PACKAGE PRESENT | Regenerated and packaged on 30 August: 160-second H.264 1080p + AAC, capture 1/1; SHA-256 `ee591d843231215d28ff93a64ca806a59d3a559b4ab9c322009e525b1bd34693`. |
| VIDEO PUBLIC / DEVPOST | VIDEO PASS; DEVPOST DRAFT 4/5 | YouTube is public and anonymously reachable. Devpost fields, media and private judge instructions are saved and previewed; final submission is not complete. |

Exact links and boundaries: [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md). Do not treat HTTP, injected authenticated proof or Chrome registry discovery as a Chrome/ChatGPT-selected tool invocation or Devpost acceptance.
