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
| Does ChatGPT in-app or Chrome WebMCP actually call the tools? | `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` | currently `NOT RUN` |

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
| generatedAt | `2026-08-26T06:09:01.387Z` |
| evidenceKind | `deterministic_reference_planner` |
| caseCount | 24 |
| repeats | 3 (72 plans) |
| firstToolAccuracy | 1.0 (24/24) |
| minFirstToolAccuracy gate | 0.9 |
| chatgptSelection | `unproven` |
| corpusChatgptSelection | `unproven` |

This runner is not ChatGPT and does not prove in-app tool selection.

## Documented LOCAL results (26 August 2026)

Root validation reran the complete clean-clone gate on `efd6310fd8e875b08d00aa0519386db83e8a474f`. This SHA predates the judge-document refresh, so the final reviewed SHA must rerun the same gate before release.

- Typecheck, ESLint (zero warnings), production Next.js build: documented pass.
- `npm run eval:webmcp:gate`: documented exit 0 on the isolated local stack.
- Vitest: 373 files, 2,616 passed, 1 skipped.
- WebMCP Chromium UI: 5/5, including public registry, authenticated two-reset flow, confirmation gate, contextual re-registration.
- Isolated sandbox fixtures: two resets, stable actors, five e-bike IDs, one thread, no contact PII.
- Isolated journey: mission -> agreement -> receipt through registered handlers; idempotent replay; listing `RESERVED`.
- Security integrations: owner authorization, self-proposal refusal, idempotence, SSE, atomic acceptance, cancellation, expiration, bilateral consent, message redaction.
- Concurrent accept races: 5/5 after listing-row lock ordering.
- Production build: 110 pages generated.

Later TI-376 commits after the original eval README snapshot exist (`b624929` through `efd6310`). The counts above are the newer clean-clone gate, while `evals/webmcp/README.md` retains the earlier TI-377 snapshot. Neither is CI or public proof.

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


## Live browser template

Complete `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` only after a reviewed SHA is deployed. Until then both ChatGPT in-app and Chrome WebMCP rows stay `NOT RUN`. Lack of the API in a given browser is `INDETERMINATE`.
