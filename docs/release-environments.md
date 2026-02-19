# Release Environments Policy (Production-Safe)

This document is the canonical environment strategy for Clawdeals.

Goal:
- Keep production for live traffic only.
- Ensure all integration/smoke/E2E validation runs outside production.

Local workflow reference:
- `docs/local-supabase-development.md`

## 1) Environment Topology

Environment model:
- `dev`: local app workflow using local Supabase (`supabase start`)
- `staging`: remote validation environment for QA, smoke, integration, and pre-release checks
- `production`: live environment only

Authoritative identifiers:
- Production Supabase project ref: `gztfmpuqtpvncdcuhqxy`
- Staging Supabase project: create and run in org `vercel_icfg_xONouQQU8hcFdkKBpX1Ebbzi` (`Thanh's projects`)

Deployment model:
- Vercel uses the same project (`clawdeals`) with branch-based promotion
- `feature/*` -> preview deployments
- `staging` -> stable staging deployment (`https://staging.app.clawdeals.com`)
- `main` -> production deployment (`https://app.clawdeals.com`)

Hard rule:
- Remote tests run on staging only, never production.
- Local tests run on local Supabase only, never production.

## 2) Credential Segregation Policy

Use distinct secret sets for staging and production.

Recommended naming in secret manager:
- `SUPABASE_URL_STAGING`
- `SUPABASE_SERVICE_ROLE_KEY_STAGING`
- `SUPABASE_URL_PROD`
- `SUPABASE_SERVICE_ROLE_KEY_PROD`

Rules:
- Local test/dev examples in docs must use local Supabase by default.
- Remote QA examples in docs must use staging credentials only.
- Production credentials must not be copied into local test commands, preview envs, or QA scripts.
- Keep production secrets accessible only to release owners/on-call operators.

> DO-NOT-COPY WARNING
> Never reuse `SUPABASE_URL_PROD` or `SUPABASE_SERVICE_ROLE_KEY_PROD` in smoke, E2E, Playwright integration, or sandbox workflows.

## 3) Hard Guardrail Policy

Policy requirement:
- Any test/smoke/integration procedure must fail closed if production Supabase URL is detected.

Detection rule:
- Block in test contexts if host equals `db.gztfmpuqtpvncdcuhqxy.supabase.co`.

Follow-up implementation checklist (script-level):
1. Add a shared `assertNonProdSupabaseTarget()` helper.
2. Call it in:
   - `e2e/integration/helpers/env.ts`
   - `scripts/smoke-api.mjs`
3. Make the process exit with non-zero status and explicit error text when prod host is detected.
4. Add unit tests for the guard helper.

## 4) Data Strategy For Staging

Staging data policy:
- Synthetic fixtures only.
- No production data copy.

Reset cadence:
- Weekly cleanup.
- Mandatory cleanup before major test campaigns.

Minimum baseline seed for staging:
- Ops owner/agent
- PSP config
- Risk rules
- Optional fixture packs for integration tests

## 5) Migration And Release Flow

1. Apply DB migrations to staging first.
2. Run staging smoke and integration checks.
3. Manual approval gate before production migration (current policy).
4. Apply migrations to production.
5. Run a production smoke subset after deployment.

See detailed runbook:
- `docs/release-staging-to-prod.md`

## 6) Test Target Policy

Allowed automated targets:
- Local app + local Supabase (default dev and integration workflow)
- Local app + staging Supabase (fallback only when local is unavailable)
- Staging app + staging Supabase (release validation)

Disallowed:
- Production Supabase in test/QA/smoke/E2E flows.

Key operational interface contract:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in non-prod tests must resolve to local or staging, never production.
- `API_BASE_URL` / `E2E_BASE_URL` must target staging or local.
- `CLAWDEALS_ENV=sandbox` is sandbox-only and must never point to production Supabase.
- `CONSOLE_OPS_ENABLED` in production is gated and intentional.

## 7) Pre-Release Checklist

1. Confirm staging and prod credentials are separated.
2. Confirm staging deployment is from `staging` branch.
3. Apply migrations to staging and verify success.
4. Run staging smoke and integration checks.
5. Validate manual QA checklist on staging:
   - `docs/ti-307-console-qa-checklist.md`
6. Record approval decision (manual gate).
7. Apply migrations to production.
8. Run production smoke subset and monitor errors/alerts.

## 8) Incident Response: Accidental Prod Writes During Testing

Immediate actions:
1. Stop the offending test job/process.
2. Revoke credentials used by that process.
3. Freeze further write tests until root cause is confirmed.

Verification:
1. Identify affected window (timestamps, actors, endpoints).
2. Query impact scope (owners/agents/listings/deals/offers/transactions).
3. Capture evidence in incident notes.

Recovery:
1. Decide cleanup/restore plan with release owner + technical owner.
2. Execute approved cleanup SQL or restore workflow.
3. Re-seed required baseline data if needed.
4. Re-run only on staging until controls are fixed.

Prevention:
1. Add or fix hard guardrail checks.
2. Update docs/examples where ambiguity was found.
3. Track a follow-up action item for closure.

## 9) Doc Validation Scenarios

1. New developer onboarding:
   - Can run local app with local Supabase (`supabase start`) without production credentials.
2. Integration test execution:
   - Local integration commands point to local endpoints and local Supabase.
3. Pre-release process:
   - Requires staging migration + staging tests before prod.
4. Accidental prod target:
   - Runbook documents stop, verify, recover.
5. Consistency:
   - No test command targets production DB host in documentation.
