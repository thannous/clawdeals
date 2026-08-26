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

All dates below are 26 August 2026. The victory plan's later calendar was a delivery schedule, not a claim that these commits landed on later days.

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

The next local candidate adds receipt persistence across `/webmcp-challenge` → `/browse`, a deterministic loopback Upstash REST mock for the full isolated gate, and a global `Origin-Agent-Cluster: ?1` response header. It passed the full local gate and is pending commit/deploy; it is not attributed to `b9fc2e3`.

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
| LOCAL | PASS on current worktree | Full gate: 377 Vitest files / 2,634 passed / 1 skipped, build 109 pages, selector 24 × 3, contracts 82/82, UI 6/6, journey 2/2, security 10/10. Pending commit/deploy. |
| CI | PASS through `9e7102e`; current HEAD WAIVED / NOT RUN | GitHub [`CI`](https://github.com/thannous/clawdeals/actions/runs/32980551636) passed every job on `9e7102e`. The two `7b52d94` dispatch records created no jobs, and the owner waived a fresh remote rerun; they are not cited as green. |
| DEPLOYED | PASS on `b9fc2e3` | The public challenge page displayed `b9fc2e346ab5`. |
| PUBLIC | Native guest read and HTTP PASS on `b9fc2e3`; authenticated journey PENDING | Codex in-app discovered five live tools and executed context → search → redacted receipt. Public routing/reset closure passed. The isolated eleven-tool sandbox journey remains pending. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| DEVPOST | NOT PROVEN | Submission, public video, and freeze are pending. |

See [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md)
and [`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md).
Do not treat the guest read path as authenticated sandbox proof or Devpost acceptance.


## Related judge docs

- [JUDGE_GUIDE.md](./JUDGE_GUIDE.md)
- [WEBMCP_ARCHITECTURE.md](./WEBMCP_ARCHITECTURE.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- [SECURITY_AUDIT_TI378.md](./SECURITY_AUDIT_TI378.md)
- [EVALS.md](./EVALS.md)
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)
