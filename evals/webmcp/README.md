# ClawDeals WebMCP evals

This directory is the public index for reproducible WebMCP Challenge evaluation. It separates deterministic contracts from live-browser and database proof.

## Coverage map

| Contract | Current evidence |
| --- | --- |
| Official `document.modelContext` registration and abort lifecycle | `src/webmcp/adapter.test.ts`, `e2e/ui/webmcp.spec.ts` |
| Exact page-scoped tool registry | `src/webmcp/config.test.ts`, `src/webmcp/tools/index.test.ts`, `e2e/ui/webmcp-challenge.spec.ts` |
| Mission validation and `policy_fit` ranking | `src/webmcp/tools/mission-tools.test.ts`, `src/webmcp/tools/negotiation-tools.test.ts`, mission service tests |
| Human confirmation and approval binding | confirmation tests, approval route/service tests, `e2e/ui/webmcp.spec.ts` |
| Atomic offer acceptance | transaction and negotiation integration tests |
| Bilateral contact reveal | contact-reveal unit and integration tests |
| Redacted action receipts | `src/webmcp/activity/action-receipts.test.ts`, `src/webmcp/tools/activity-tools.test.ts`, `src/webmcp/ActivityHud.test.tsx` |
| Judge-only reset and two-run determinism | reset handler/service tests, `e2e/integration/sandbox-ebike-fixtures.spec.ts`, `e2e/ui/webmcp-challenge.spec.ts` |
| Natural-language first-tool and multi-step reference planning | `reference-selection.cases.json`, `src/webmcp/evals/reference-selection.test.ts`, archived `results/reference-selection.json` |
| Prompt injection remains untrusted data | `src/webmcp/tools/collab-tools.test.ts`, `SECURITY-MATRIX.md` |
| Mission → agreement → receipt through registered tool handlers | `e2e/integration/webmcp-submission-journey.spec.ts` on isolated Supabase |

## Judge-mode invariants

1. Public registry: exactly five read tools.
2. Authenticated registry: exactly eleven contextual tools.
3. No owner-only or legacy REST wrapper appears on the challenge route.
4. Reset returns `404` outside sandbox and `403` for a non-judge agent.
5. Two authorized resets preserve the same synthetic actors, five e-bike IDs and thread ID.
6. Fixtures contain no email address, phone number or real contact details.
7. Reset clears stale local mission and receipt state, but preserves the stored judge key.
8. Write receipts distinguish `success`, `denied` and outcome-`unknown`; ambiguous actions are not advertised as safe to retry.

## Commands

```bash
npx vitest run \
  src/webmcp/adapter.test.ts \
  src/webmcp/config.test.ts \
  src/webmcp/tools/index.test.ts \
  src/webmcp/activity/action-receipts.test.ts \
  src/__tests__/pages-api/v1/sandbox/reset.test.ts \
  src/server/services/sandbox-fixtures.test.ts

npx playwright test e2e/ui/webmcp-challenge.spec.ts --project=ui --workers=1
```

The database-backed reset proof requires an isolated sandbox Supabase instance and the environment described in [`docs/sandbox-getting-started.md`](../../docs/sandbox-getting-started.md):

```bash
npx playwright test e2e/integration/sandbox-ebike-fixtures.spec.ts --project=integration --workers=1
```

## Evaluation layers

The evidence deliberately keeps four layers separate:

1. Vitest contracts for registry, confirmation, cancellation, ambiguity,
   redaction and output limits.
2. A deterministic reference planner with 24 natural-language cases executed
   three times. It is not an LLM and never claims that ChatGPT selected a tool.
3. Playwright against synthetic, isolated Supabase data. The browser capability
   is mocked, but the registered `tool.execute` handlers, HTTP APIs, policies,
   database transitions and receipts are real.
4. Real browser checks, kept separate by runtime: Codex in-app guest execution
   is `PASS`, ChatGPT in-app is `NOT RUN`, and Chrome is `INDETERMINATE`; see
   [`LIVE-BROWSER-EVIDENCE.md`](LIVE-BROWSER-EVIDENCE.md).

The executable invariant map is in [`SECURITY-MATRIX.md`](SECURITY-MATRIX.md).

## Reference-selection result

`reference-selection.cases.json` contains 24 visitor, agent and owner prompts
covering first-tool selection, multi-step planning, route-scoped roles,
unauthorized approval, contact consent, cancellation, ambiguity and injected
listing content. `results/reference-selection.json` archives three deterministic
runs per case:

```text
24 cases × 3 runs = 72 plans
first-tool accuracy = 100%
ChatGPT selection = unproven
```

Re-run without mutating the archive:

```bash
npm run eval:webmcp:selection
```

Update the archive only after reviewing a corpus or planner change:

```bash
npm run eval:webmcp:selection:update
```

## Submission release gate

The explicit local release gate includes TypeScript, ESLint, the full Vitest
suite, a production build, the reference selector, scoped WebMCP contracts,
browser UI tests, the isolated tool journey and the server security integrations:

```bash
npm run eval:webmcp:gate
```

The journey and security stages require a non-production isolated environment
as described in [`docs/sandbox-getting-started.md`](../../docs/sandbox-getting-started.md).
The target guard refuses known production Supabase/API hosts. Do not use
production data or production secrets.

## Local evidence — 26 August 2026

- TypeScript: pass (`tsc --noEmit`).
- ESLint: pass with zero warnings.
- Production Next.js build: pass.
- Complete `npm run eval:webmcp:gate`: pass with exit code 0 on the isolated local stack.
- Vitest: 377 files passed; 2,634 tests passed; 1 skipped.
- WebMCP Chromium UI E2E: 6/6 passed in production-server mode, including the public registry, confirmation gate, contextual re-registration and cross-route receipt persistence.
- Isolated Supabase integration: 1/1 passed; the test performs two resets and verifies stable actors, five e-bike IDs, one thread, one message and no contact PII.
- Deterministic reference selector: 24/24 cases passed across three runs each (72 plans); archived result labels ChatGPT selection `unproven`.
- Scoped WebMCP contracts: 13 files, 82 tests passed.
- Isolated reset plus mission → agreement → receipt suite: 2/2 passed through registered WebMCP handlers; idempotent replay and persisted reservation verified.
- Server security integrations: 10/10 passed for owner authorization, self-proposal refusal, idempotence, SSE, atomic acceptance, cancellation, expiration, bilateral consent and message redaction.
- Concurrent acceptance regression: 5/5 repeated races passed after `20260826170000_ti_377_offer_accept_lock_order.sql` serialized acceptance on the shared listing row.
- UUID redaction regression: fixed and covered so workflow IDs remain usable while emails and phone numbers stay redacted.
- Real ChatGPT in-app browser: `NOT RUN`.
- Real Codex in-app WebMCP guest path: `PASS` on public `b9fc2e346ab5`.
- Real Chrome WebMCP: `INDETERMINATE` in the tested Chrome 151 profile.

The gate counts above are local proof. The Codex row is separate public native
evidence on `b9fc2e3`; it does not prove the pending local delta was pushed,
Chrome or ChatGPT support, an authenticated public sandbox, or Devpost acceptance.
