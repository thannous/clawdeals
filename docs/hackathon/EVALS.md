# Evals

Reproducible evaluation index for the WebMCP Challenge submission. Deterministic contracts, isolated database journeys, and live-browser proof are separate layers.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`


## What the evals prove

| Question | Answered by | Not answered by |
| --- | --- | --- |
| Does the official adapter register and abort correctly? | Vitest `src/webmcp/adapter.test.ts`, Playwright UI | ChatGPT |
| Is the page-scoped registry exact? | `src/webmcp/tools/index.test.ts`, `e2e/ui/webmcp-challenge.spec.ts` | deployment |
| Would a reference planner pick the first tool we expect? | 24 x 3 deterministic plans | ChatGPT tool selection |
| Do registered handlers create a mission, reserve a listing, and persist a receipt? | isolated Playwright + Supabase | production data |
| Do authz, consent, races, and redaction hold on the server? | `eval:webmcp:security` | a public URL |
| Does a real in-app runtime call the tools? | `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` | Codex guest path PASS; ChatGPT NOT RUN; Chrome INDETERMINATE |

## Commands

```bash
npm run eval:webmcp:selection    # 24 cases x 3 deterministic reference plans
npm run eval:webmcp:contracts    # scoped WebMCP + reset contracts
npm run eval:webmcp:ui           # Chromium UI, production-server mode
npm run eval:webmcp:journey      # isolated fixtures + mission-to-receipt
npm run eval:webmcp:security     # owner authz, atomic accept, consent, redaction
npm run eval:webmcp:gate         # typecheck, lint, unit, build, and the five stages above
```

`eval:webmcp:gate` is also the second half of `npm run release:hackathon:local`. Journey and security require isolated non-production env (`docs/sandbox-getting-started.md`). Playwright refuses the known production Supabase host.

Update the archived selector only after reviewing a corpus change:

```bash
npm run eval:webmcp:selection:update
```

## Plan section 14 mapping

Victory-plan cases versus current evidence:

| Plan case | Expected | Evidence |
| --- | --- | --- |
| "Find a used e-bike under EUR 1,200" | `search_listings` | reference-selection corpus |
| "Monitor this search for a week" | `create_buy_mission` | corpus + mission-tool tests |
| "Ask about battery health" | `start_thread` then `send_message` | corpus + negotiation tools |
| "Offer EUR 1,150" | `make_offer` | corpus + negotiation tools |
| Accept EUR 1,350 with hard cap 1,300 | policy stop + approval | buy-mission guard + approval tests |
| "Approve it" off the owner page | refused / tool absent | registry + owner-approval integration |
| Owner session approval | success | `resolve_approval` + mission-owner-approval spec |
| Same idempotency key twice | one offer | journey + offer-actions |
| Two buyers accept at once | one reservation | offer-actions + TI-377 lock-order migration |
| One-sided contact request | no reveal | contact-reveal spec |
| Bilateral consent | counterparty-only | contact-reveal spec |
| Listing prompt injection | untrusted data | collab-tools test |
| Cancelled call | `ABORTED` | adapter/http/gate |
| Ambiguous network | `safe_to_retry: false` | http + receipts |
| Tool output size | <= 1,500 UTF-8 bytes | output-cap + journey |
| Public search without key | success | collab-tools / http |
| Approval tools on browse | absent | tools/index.test |
| Full path | mission -> agreement -> receipt | `e2e/integration/webmcp-submission-journey.spec.ts` |

## Reference planner (not ChatGPT)

Archive: `evals/webmcp/results/reference-selection.json`

| Field | Value |
| --- | --- |
| generatedAt | `2026-08-26T16:12:33.726Z` |
| evidenceKind | `deterministic_reference_planner` |
| caseCount | 24 |
| repeats | 3 (72 plans) |
| firstToolAccuracy | 1.0 (24/24) |
| minFirstToolAccuracy gate | 0.9 |
| chatgptSelection | `unproven` |
| corpusChatgptSelection | `unproven` |

This runner is not ChatGPT and does not prove in-app tool selection.

## Documented LOCAL results (26 August 2026)

Root validation ran the official `npm run release:hackathon:local` gate to exit 0 on clean commit `2ed489d5a5086f449c9985d9627f2d024032e3a3`, using only the isolated local Supabase stack. That commit contains the cross-route receipt fix, deterministic Upstash mock and `Origin-Agent-Cluster` header.

- Typecheck, ESLint (zero warnings), production Next.js build: pass.
- `npm run eval:webmcp:gate`: exit 0 on the isolated local stack.
- Vitest: 377 files, 2,634 passed, 1 skipped.
- WebMCP Chromium UI: 6/6, including public registry, confirmation gate, contextual re-registration and cross-route receipt persistence.
- Isolated sandbox fixtures: two resets, stable actors, five e-bike IDs, one thread, no contact PII.
- Isolated journey: mission -> agreement -> receipt through registered handlers; idempotent replay; listing `RESERVED`.
- Security integrations: owner authorization, self-proposal refusal, idempotence, SSE, atomic acceptance, cancellation, expiration, bilateral consent, message redaction.
- Concurrent accept races: 5/5 after listing-row lock ordering.
- Production build: 109 pages generated.

This clean-commit gate is local proof. Remote CI, deployment and public behavior remain separately evidenced below.

On 27 August, the clean repository candidate `fc29e6659d5afa3bca9e64774693e81895836cef`
passed release preflight, typecheck, lint, 381 Vitest files / 2,667 passed / 1
skipped, a 109-page build, selector 24 × 3, contracts 82/82 and Chromium UI
6/6. Journey and security were not rerun on that SHA because the local Docker
engine was unavailable; the public sandbox was not used as a substitute.

On 29 August, runtime `60b99f70868fc70a2b947a8a70c4e2212e174f3a`
superseded that local candidate: typecheck, lint, 381 Vitest files / 2,668
passed / 1 skipped, complete Supabase reset, journey 2/2, security 10/10 and the
final 160-second capture 1/1 all passed.

## Proof layers

| Layer | Status | What this file may cite |
| --- | --- | --- |
| LOCAL | PASS on reviewed runtime `60b99f7` | 381 Vitest files / 2,668 passed / 1 skipped, typecheck, lint, complete Supabase reset, journey 2/2, security 10/10 and capture 1/1. |
| CI | Last green `9e7102e`; current WAIVED / NOT RUN | GitHub Actions is intentionally not used for the current candidate. |
| DEPLOYED / PUBLIC HTTP | PASS for runtime `60b99f7` through a documentation descendant | The live hub returns 200 with `Origin-Agent-Cluster: ?1`, public listings return 200, and production sandbox reset remains 404. Database migration state is not inferred from deployment. |
| PUBLIC native guest | PASS on `2ed489d5a508` | Codex in-app discovered five tools, executed context → search, navigated to `/browse`, retained the same five-tool registry and read the redacted receipt there. |
| PUBLIC authenticated sandbox | PENDING | Eleven-tool reset and mutation journey are not proven on a public isolated sandbox. |
| CHROME | INDETERMINATE | Chrome 151 loaded the deployment without an active WebMCP runtime. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| VIDEO LOCAL | PASS / CURRENT FILE PRESENT | The 160-second H.264 1080p + AAC artifact exists locally; SHA-256 `ed2372ac304cdb81527c1da97d8b71e199e4153c24612b2a9dad07c39961315d`. |
| VIDEO PUBLIC / DEVPOST | NOT PROVEN | YouTube publication, submission, and freeze are pending. |

Do not treat a local test pass as CI, deployment, public smoke, ChatGPT tool selection, or Devpost acceptance.


## Live browser template

Update `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` after every reviewed deployment. ChatGPT remains `NOT RUN`; Chrome remains `INDETERMINATE` because the tested profile did not expose the API. Lack of the API in a given browser is not a product pass or fail.
