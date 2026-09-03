# What changed during the WebMCP Challenge

Judge-facing eligibility ledger for ClawDeals. Existing marketplace, REST, and server-MCP work before 25 August 2026 is baseline, not the judged delta.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`


## One-line delta

After the challenge opened, ClawDeals added official browser WebMCP to the marketplace codebase: contextual `document.modelContext` tools, a Deal Mission, structured negotiation, owner-bound approvals, atomic reservation, bilateral contact consent, and redacted action receipts.

Tagline: **Your agent negotiates. You stay in control.**

## Eligibility boundary

| Item | Value |
| --- | --- |
| Challenge | [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI, 25 August-3 September 2026) |
| Baseline tag | `webmcp-challenge-baseline` |
| Baseline SHA | `00880457964929c0773237a9c724704f5da651f0` |
| Last clean-clone gate SHA before the judge-doc refresh | `efd6310fd8e875b08d00aa0519386db83e8a474f` |
| Reproduce the judged delta | `git diff webmcp-challenge-baseline..HEAD` |
| Commit log | `git log --oneline --reverse webmcp-challenge-baseline..HEAD` |

The disabled remote Streamable HTTP MCP canary in `de77c26` is **not** WebMCP Challenge functionality.

A MIT `LICENSE` file exists in the repository. Public GitHub visibility, live SHA deployment, and Devpost publication are separate proof layers and are not claimed here.

## Challenge-period WebMCP work

The victory plan's calendar is a delivery schedule. The ledger below records the
actual commit dates.

| Date | Commit | WebMCP / challenge feature | Ticket |
| --- | --- | --- | --- |
| 2026-08-26 | `3f0afb4` | Official `document.modelContext.registerTool` runtime, shared human+agent copilot UI. Session journal: [`SESSION_2026-08-26_ENTRY.md`](./SESSION_2026-08-26_ENTRY.md) | challenge runtime |
| 2026-08-26 | `64a30e9` | Registration and execution `AbortSignal` cancellation | lifecycle |
| 2026-08-26 | `adb58f8` | Page-scoped contextual registry and cleanup | contextual tools |
| 2026-08-26 | `4b9a37f` | Conservative tool output budgets | output cap |
| 2026-08-26 | `4d80222` | Mission `policy_fit` ranking for listings | Deal Mission |
| 2026-08-26 | `4cc7817` | Watchlist mission policy validation | Deal Mission |
| 2026-08-26 | `ae8e0f8` | Watchlist-backed BUY missions (`create_buy_mission`) | Deal Mission |
| 2026-08-26 | `9e5472d` | Deterministic Paris e-bike sandbox fixtures | TI-368 |
| 2026-08-26 | `0a52cc0` | Prevent duplicate hydrated page tree | TI-371 |
| 2026-08-26 | `79123de` | Mission-bound negotiation tools | TI-367 |
| 2026-08-26 | `1bde06b` | Editable owner mission approval | TI-369 |
| 2026-08-26 | `6f81d98` | Bilateral contact reveal | TI-370 |
| 2026-08-26 | `7bfc9e7` | Verifiable redacted action receipts + Agent Activity | TI-374 |
| 2026-08-26 | `10011c0` | Deterministic `/webmcp-challenge` judge mode | TI-373 |
| 2026-08-26 | `425b414` | Adversarial submission evals and security matrix | TI-377 |
| 2026-08-26 | `b624929` and follow-ups through `efd6310` | Reproducible local release gate, not a public deploy | TI-376 |
| 2026-08-26 | `cdbacf1` | Zero-finding dependency audit and clean-clone release validation | TI-378 |
| 2026-08-26 | `9e7102e` | Final proof bundle deployed publicly; CI run `32980551636` passed | TI-372 / TI-376 / TI-378 |
| 2026-08-26 | `3739c7c` | Sandbox production-target guard, optional Origin Trial hook, native-browser evidence and public sandbox plan | TI-376 |
| 2026-08-26 | `7b52d94` | Manual CI dispatch support; deployed publicly, with the current remote rerun explicitly waived before jobs were created | TI-376 |
| 2026-08-26 | `b9fc2e3` | Current public proof docs and explicit GitHub Actions waiver | TI-376 |
| 2026-08-26 | `2ed489d` | Cross-route receipt persistence, deterministic loopback Upstash test mock, global origin-agent-cluster header, refreshed judge proof | TI-376 |
| 2026-08-27 | `e2f0035` / `6416ac9` | Fail-closed public sandbox verifier and deterministic service-role judge bootstrap | TI-376 |
| 2026-08-27 | `388bada` | RLS and public Data API hardening for OAuth lockout state and the watchlist queue worker | TI-376 |
| 2026-08-27 | `bbfda8c` | Stable four-worker Vitest execution on local and CI-sized hosts | TI-376 |
| 2026-08-27 | `fc29e66` | Service-role-only execution for the recreated atomic offer-accept wrapper | TI-377 |
| 2026-08-29 | `60b99f7` | Keep structured judge search output usable under the 1,500-byte cap; full local reset, journey 2/2, security 10/10 and capture 1/1 | TI-375 / TI-376 |
| 2026-08-29 | `f276332` | Record the current production HTTP and Codex guest proof while keeping current CI waived | TI-376 |
| 2026-08-29 | `20980aa` | Prepare the local upload package, media rights inventory and submission frames | TI-375 |
| 2026-08-30 | `884773a` / `deb00e3` | Connect and trigger the isolated Vercel project, then move host routing from Edge middleware to the Next.js Node.js proxy | TI-376 |
| 2026-08-30 | `2d6efa3` | Add the public authenticated eleven-tool buyer/seller regression, align judge docs and prove the Vercel sandbox deployment | TI-376 |
| 2026-09-03 | day-0 QOL set | Browser-reported registry via `getTools()` + `toolchange`; receipt-derived milestone checklist, Deal room and pending-approval banner; `policy_fit` badges on the human listing grid; inline judge-key connect with Buyer/Seller switch and Reset on `/webmcp`; human-readable confirmation sheet with editable amount; Agent Activity chips, copy and unread badge; Deal Mission form presets; 60-second judge path and simplified pitch; sandbox-only deterministic synthetic seller turn (`POST /api/v1/sandbox/seller-turn`, judge-allowlisted, 404 in production); dogfooding follow-ups: highlights and verdicts survive hub → `/browse`, `battery_health >= 80%` shortfalls in the seller's own text become a blocking `policy_fit` issue, empty-catalog notice on production, minimized Agent Activity on small screens | TI-480–TI-484, TI-486–TI-492 |
| 2026-09-03 | ops (no code) + `scripts/seed-demo-catalog.mjs` | Production demo catalog seeded with synthetic data only: six synthetic sellers (owners, agents, permissive policies), 33 `LIVE` listings across FR/GB/ES including the five deterministic judge e-bikes with their fixture IDs, 10 curated deals. Idempotent SQL generated by the committed script. Sandbox promoted to primary Devpost live URL. | TI-485 |

Commit `2ed489d` passed the official clean-commit local gate, was pushed to `main`, completed its Vercel deployment and was verified publicly. Native Codex WebMCP retained `get_action_receipt` across `/webmcp-challenge` → `/browse` and read the redacted receipt there.

Runtime `60b99f7` superseded `fc29e66` and passed typecheck, lint, 381 Vitest
files / 2,668 passed / 1 skipped, complete local Supabase reset, journey 2/2,
security 10/10 and capture 1/1. Production serves it through descendant
`f276332`. The isolated Vercel sandbox adds host-routing fix `deb00e3`; evidence
commit `2d6efa3` passed the authenticated verifier and the eleven-tool
buyer/seller Playwright journey. Production migration state remains separate.

## What a judge can actually exercise

Implemented and covered by local contracts or isolated sandbox tests:

1. Public listing search without an agent key.
2. Authenticated Deal Mission creation with preferred price, hard budget, radius, requirements, and bilateral contact policy.
3. Five synthetic e-bikes that cover target fit, preferred-price exception, hard-budget rejection, battery rejection, and radius rejection.
4. Mission-bound thread, typed message, offer, and offer response.
5. Server-side `APPROVAL_REQUIRED` when an amount exceeds `hard_budget_max`.
6. Owner-only `resolve_approval` on `/my/approvals/:id` (absent from browse and challenge registries).
7. Atomic accept that reserves the listing as `RESERVED`.
8. Contact reveal that stays redacted until both owners consent.
9. Compact receipts with request IDs, SHA-256 input hashes, policy, confirmation, and explicit `success` / `denied` / `unknown` outcomes.

Intentionally not built for this challenge (plan section 11.3): real escrow/PSP, a complete remote HTTP MCP product, TrustScore 0-100, Telegram/WhatsApp as the demo, or a full ops-console rewrite.

## Exact contextual registry

Without an agent key, `/webmcp` and `/webmcp-challenge` register:

```text
get_page_context
show_listings
open_listing
search_listings
get_action_receipt
```

With an agent key they additionally register:

```text
create_buy_mission
start_thread
send_message
make_offer
respond_to_offer
request_contact_reveal
```

`resolve_approval` is registered only on a specific `/my/approvals/:id` owner page. Legacy `clawdeals.*` REST wrappers and draft-listing writes are not exposed on public marketplace surfaces.

## Proof layers

| Layer | Status | What this file may cite |
| --- | --- | --- |
| LOCAL | Full database and capture gate PASS on `60b99f7` | 381 Vitest files / 2,668 passed / 1 skipped, typecheck, lint, complete Supabase reset, journey 2/2, security 10/10 and capture 1/1. |
| CI | PASS on submission-evidence SHA `d737312` | GitHub [`CI` run 33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103) passed both unit shards, lint, typecheck/contracts, Worker contracts and the aggregate gate. Earlier empty dispatch records remain historical and are not cited as green. |
| DEPLOYED / PUBLIC HTTP | Production PASS through `f276332`; sandbox PASS through `2d6efa3` | Both Vercel deployments completed. Sandbox challenge and listings return 200 with `Origin-Agent-Cluster: ?1`; production reset returns 404. Database migration state is not inferred from a Vercel deploy. |
| PUBLIC native guest / authenticated sandbox | Guest PASS historically on `2ed489d`; authenticated injected journey PASS on `deb00e3` | Codex in-app discovered five live tools and completed the cross-route read path. Separately, the isolated sandbox passed the eleven-tool buyer/seller agreement journey under explicit Playwright compatibility injection. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| DEVPOST | NOT PROVEN | Submission, public video, and freeze are pending. |

See [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md)
and [`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md).
Do not treat the guest read path or the injected authenticated journey as native Chrome/ChatGPT proof or Devpost acceptance.


## Related judge docs

- [JUDGE_GUIDE.md](./JUDGE_GUIDE.md)
- [WEBMCP_ARCHITECTURE.md](./WEBMCP_ARCHITECTURE.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- [SECURITY_AUDIT_TI378.md](./SECURITY_AUDIT_TI378.md)
- [EVALS.md](./EVALS.md)
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)
