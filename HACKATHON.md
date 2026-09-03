# WebMCP Challenge — ClawDeals

Hackathon: [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI, 25 August–3 September 2026)

> **Your agent negotiates. You stay in control.**

ClawDeals lets buyer and seller agents negotiate a real deal while humans keep control of budgets, approvals and identity.

1. **The agent negotiates** — it searches, ranks, asks the seller and prepares offers through page-scoped WebMCP tools.
2. **The server enforces human limits** — hard budgets, owner-only approvals and bilateral consent are re-checked server-side.
3. **Every action stays verifiable** — each protected step leaves a redacted receipt with a request ID and a policy decision.

## Judge in 60 seconds

1. Open [`sandbox.clawdeals.com/webmcp-challenge`](https://sandbox.clawdeals.com/webmcp-challenge) (primary judge URL) in ChatGPT's in-app browser, or in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` (the Model Context Tool Inspector extension also works). The production hub [`clawdeals.com/webmcp-challenge`](https://clawdeals.com/webmcp-challenge) exposes the same public tools on a seeded synthetic demo catalog.
2. Copy the mission prompt from the hub (Paris e-bike, preferred 1,200 EUR, hard budget 1,300 EUR, battery ≥ 80%, offer 1,100 EUR).
3. Watch the registry: 5 public tools without a key; 11 contextual tools once the synthetic judge key is pasted in the hub's **Judge key** field.
4. Look for three outcomes: `APPROVAL_REQUIRED` on 1,350 EUR, `RESERVED` after the seller accepts, and a redacted receipt you can read back with `get_action_receipt`.

The hub's "What you should see" checklist lights up as each of these happens; the "What the browser sees" card reads the registry back through `document.modelContext.getTools()`.

ClawDeals existed before the challenge as an agent-native marketplace with REST APIs, a server MCP, listings, deals, approvals and transaction workflows. Only the WebMCP work implemented after the challenge opened is submitted for judging.

## Full evidence index

- Primary judge hub (sandbox): [`sandbox.clawdeals.com/webmcp-challenge`](https://sandbox.clawdeals.com/webmcp-challenge) — judge credentials are supplied privately
- Production hub: [`clawdeals.com/webmcp-challenge`](https://clawdeals.com/webmcp-challenge) — same public tools on a seeded synthetic demo catalog (33 listings, 10 deals, 6 synthetic sellers)
- Production marketplace demo: [`/webmcp`](https://clawdeals.com/webmcp)
- Strategy and acceptance plan: [`docs/hackathon/plan-de-victoire-webmcp-challenge.md`](docs/hackathon/plan-de-victoire-webmcp-challenge.md)
- Judge guide: [`docs/hackathon/JUDGE_GUIDE.md`](docs/hackathon/JUDGE_GUIDE.md)
- Challenge-period ledger: [`docs/hackathon/WHAT_CHANGED.md`](docs/hackathon/WHAT_CHANGED.md)
- Entry session (first copilot commit + Devpost/credits): [`docs/hackathon/SESSION_2026-08-26_ENTRY.md`](docs/hackathon/SESSION_2026-08-26_ENTRY.md)
- WebMCP architecture and tool catalog: [`docs/hackathon/WEBMCP_ARCHITECTURE.md`](docs/hackathon/WEBMCP_ARCHITECTURE.md)
- Evals and security: [`docs/hackathon/EVALS.md`](docs/hackathon/EVALS.md), [`docs/hackathon/SECURITY_MODEL.md`](docs/hackathon/SECURITY_MODEL.md)
- Secret audit: [`docs/hackathon/SECRET_AUDIT_2026-08-26.md`](docs/hackathon/SECRET_AUDIT_2026-08-26.md)
- Public video: [YouTube](https://youtu.be/mjNd6BNk_0U) and [`docs/hackathon/DEMO_SCRIPT.md`](docs/hackathon/DEMO_SCRIPT.md) — publication and anonymous playback PASS
- Video evidence: [`docs/hackathon/VIDEO_EVIDENCE_2026-08-26.md`](docs/hackathon/VIDEO_EVIDENCE_2026-08-26.md)
- Devpost final copy: [`docs/hackathon/DEVPOST_SUBMISSION_DRAFT.md`](docs/hackathon/DEVPOST_SUBMISSION_DRAFT.md) — saved draft 4/5, not submitted
- Reproducible release runbook: [`docs/hackathon/release-candidate-runbook.md`](docs/hackathon/release-candidate-runbook.md)
- Release evidence: [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md)
- Public smoke evidence: [`docs/hackathon/PUBLIC_SMOKE_2026-08-26.md`](docs/hackathon/PUBLIC_SMOKE_2026-08-26.md)
- Native WebMCP evidence: [`docs/hackathon/NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](docs/hackathon/NATIVE_WEBMCP_EVIDENCE_2026-08-26.md)
- Public sandbox provisioning plan: [`docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md`](docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md)
- WebMCP eval index: [`evals/webmcp/`](evals/webmcp/)

The judge hub reports the browser's real `document.modelContext` support, the exact tools that successfully registered, and the sanitized deployed commit SHA when the host provides one. Its launch button opens the product marketplace, not a simulator.

## Eligibility boundary

Pre-existing ClawDeals baseline:

```text
00880457964929c0773237a9c724704f5da651f0
```

The repository tag `webmcp-challenge-baseline` points to that commit. Reproduce the submitted delta with:

```bash
git diff webmcp-challenge-baseline..HEAD
git log --oneline --reverse webmcp-challenge-baseline..HEAD
```

The disabled remote server-MCP canary in `de77c26` is not presented as WebMCP challenge functionality.

## What we built during the WebMCP Challenge

| Area | Challenge-period implementation | Evidence |
| --- | --- | --- |
| Official WebMCP runtime | `document.modelContext.registerTool`, official annotations, registration and execution `AbortSignal` lifecycles | `3f0afb4`, `64a30e9`, `adb58f8`, `4b9a37f` |
| Contextual shared UI | Page-scoped tools that search, filter, highlight and open the same marketplace surface the owner sees | `3f0afb4`, `adb58f8`, `0a52cc0` |
| Deal Mission | A watchlist-backed BUY mission with Paris radius, preferred price, hard budget, requirements and autonomous-action limits | `4d80222`, `4cc7817`, `ae8e0f8` |
| Deterministic candidates | Five synthetic e-bikes covering target fit, preferred-price exception, hard-budget rejection, battery rejection and radius rejection | `9e5472d` and the TI-373 judge-mode change containing this document |
| Structured negotiation | Mission-bound thread creation, typed messages, offers and offer responses exposed as contextual WebMCP tools | `79123de` |
| Human control | Editable confirmation, server-side mission policies, owner approvals and atomic reservation of accepted offers | `1bde06b` |
| Bilateral consent | Contact reveal remains redacted until both transaction owners consent; retries are idempotent | `6f81d98` |
| Verifiable activity | Persistent redacted action receipts with request IDs, canonical input hashes, policy decisions, approvals and explicit outcomes | `7bfc9e7` |
| Judge mode | Dedicated `/webmcp-challenge`, exact registry display, copyable mission, judge-only isolated reset and two-reset reproducibility | TI-373 change containing this document |
| Submission evals | 24 natural-language cases × 3 deterministic runs, adversarial contracts, isolated mission-to-agreement journey and explicit live-browser evidence boundary | TI-377 change containing this document |

## Exact contextual registry

Without an agent key, `/webmcp` and `/webmcp-challenge` register:

```text
get_page_context
show_listings
open_listing
search_listings
get_action_receipt
```

With an agent key, they additionally register:

```text
create_buy_mission
start_thread
send_message
make_offer
respond_to_offer
request_contact_reveal
```

Owner-only approval resolution is registered only on a specific `/my/approvals/:id` page. Legacy `clawdeals.*` REST wrappers and draft-listing writes are not exposed on public marketplace surfaces.

## Deterministic judge mission

Copy this prompt from the judge hub:

> Create a BUY mission for a used e-bike within 25 km of Paris. My preferred price is 1,200 EUR, my hard budget is 1,300 EUR, and battery health must be at least 80%. Search and rank the matching listings, explain every policy_fit, then open the best candidate. Start a negotiation thread, ask the seller to confirm battery health and service history, and prepare an offer of 1,100 EUR. Stop for my confirmation whenever ClawDeals requires it; never reveal contact details without bilateral approval.

The isolated judge reset creates only synthetic data:

- one dedicated buyer mission;
- one dedicated synthetic seller;
- five stable e-bike candidates;
- one stable negotiation thread and one system message;
- no real email address, phone number or contact identity.

Reset access is server-side allowlisted through `WEBMCP_JUDGE_AGENT_ID`. It is unavailable outside `CLAWDEALS_ENV=sandbox`, never exposes the configured identity to page JavaScript, and does not clear the stored judge key.

## Trust and failure semantics

- Read tools never silently gain write scope.
- Writes stop for editable human confirmation and are revalidated server-side.
- Mission hard-budget violations create approvals rather than bypassing policy.
- Contact information requires bilateral owner consent.
- Receipts redact secrets and personal data before hashing or persistence.
- Network or timeout ambiguity is recorded as `outcome: unknown` with `safe_to_retry: false` so the agent reconciles before retrying.
- Fixture reset is restricted to a dedicated synthetic seller on an isolated sandbox host; production returns `404`.
- Sandbox reset and fixture services fail closed when either Supabase URL is missing, unknown or points to the production project.
- Chrome Origin Trial delivery is opt-in through `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN`; no token is committed to the repository.

## Reproducible evaluation

The archived reference planner result is intentionally labeled
`chatgptSelection: unproven`. It records 24 natural-language cases across three
deterministic runs (72 plans), while the application tests separately prove
authorization, idempotence, atomic acceptance, bilateral consent, prompt
injection handling, cancellation, ambiguous outcomes, redaction and the 1,500
UTF-8-byte output cap.

The isolated submission journey invokes the actual registered tool handlers for
mission creation, offer creation, seller acceptance and receipt lookup against
synthetic Supabase data. `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` keeps real
in-app and Chrome WebMCP verification separate. The deployed public read path
passed in the Codex in-app browser; ChatGPT remains `NOT RUN`, and connected
Chrome 151 remains `INDETERMINATE` because its WebMCP runtime was not active.

## Local verification

```bash
nvm use
npm ci
cp .env.example .env.local
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run eval:webmcp:selection
npm run eval:webmcp:contracts
npm run eval:webmcp:ui
```

Database integration tests must target isolated local/staging Supabase data, never production:

```bash
npm run eval:webmcp:journey
npm run eval:webmcp:security
```

The complete local submission gate is `npm run eval:webmcp:gate`. Its journey
and security stages require the non-production environment described in
`docs/sandbox-getting-started.md`.

For a clean release candidate, follow
`docs/hackathon/release-candidate-runbook.md` and run
`npm run release:hackathon:local`; it includes the preflight. The preflight deliberately reports deploy,
public smoke and Devpost as unchecked local-external layers.

The first clean-clone gate passed on implementation SHA `3f1057541ac3fd523fbc89f0ea4b367e52077026`:
373 Vitest files / 2,616 tests passed / 1 skipped, build 110 pages, selector 24 × 3,
contracts 79/79, UI 5/5, journey 2/2 and security 10/10. GitHub `CI` and `SDK CI`,
Vercel deployment, and public HTTP route checks also passed for that SHA; the exact links and
remaining proof boundaries are recorded in `docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`.

Later hardening on `3739c7c` / `7b52d94` passed 2,627 unit tests plus one
skip, typecheck, lint, a 109-page production build, 81 WebMCP contracts and five
WebMCP UI tests. Vercel and public HTTP checks passed on `7b52d94`. A fresh
GitHub Actions rerun for that historical HEAD was explicitly waived before any
job was created. A later current-packet run supersedes that boundary: [`CI` run
33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103)
passed on `d737312`.

The current reviewed WebMCP runtime is `60b99f70868fc70a2b947a8a70c4e2212e174f3a`.
It passed typecheck, lint, 381 Vitest files / 2,668 tests passed / 1 skipped,
complete local Supabase reset, journey 2/2, security 10/10 and capture 1/1.
Production serves it through documentation descendant `f276332`. The isolated
Vercel sandbox adds the Node.js host-routing fix `deb00e3`; current evidence and
the public-sandbox regression test are committed at `2d6efa3`.

The public authenticated sandbox journey is PASS under explicit Playwright
compatibility injection: eleven tools, deterministic reset, buyer offer, seller
acceptance, atomic `RESERVED`, redacted receipt and idempotent replay. Native
ChatGPT remains `NOT RUN` and Chrome remains `INDETERMINATE`. Submission-evidence
CI is PASS on `d737312` (run `33312602103`), and both production and
sandbox Vercel deployments completed successfully. The 160-second video is
public at https://youtu.be/mjNd6BNk_0U and anonymous playback is PASS. The
Devpost entry is saved and previewed as a 4/5 draft; final submission and the
post-submission freeze remain pending proof layers.
