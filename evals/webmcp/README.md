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

TI-377 expands this index with adversarial prompt-injection, PII, stale-approval, timeout and double-submit matrices. Until those artifacts land, this file describes current evidence only and does not claim the pending cases passed.

## Local evidence — 26 August 2026

- TypeScript: pass (`tsc --noEmit`).
- ESLint: pass with zero warnings.
- Production Next.js build: pass.
- Vitest: 370 files passed; 2,599 tests passed; 1 skipped.
- Judge hub Chromium E2E: 2/2 passed (public registry and authenticated two-reset flow).
- Isolated Supabase integration: 1/1 passed; the test performs two resets and verifies stable actors, five e-bike IDs, one thread, one message and no contact PII.

These are local proofs only. They do not prove the GitHub delta was pushed, a deployment succeeded, the public URL is live, or Devpost accepted the submission.
