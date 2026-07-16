# Manual Release Flow: Staging To Production

This runbook defines the manual promotion flow from staging to production.

Current operating mode:
- CI staging gate is not mandatory yet.
- Manual release gate is required.

## Scope

Applies to:
- DB migrations in `supabase/migrations/`
- App deployment promotion from `staging` branch to `main`
- Post-deploy smoke verification

Does not replace:
- Incident response policy in `docs/release-environments.md`

## Roles

Default decision owners:
- Release owner: approves go/no-go for production rollout
- Technical owner/on-call: validates migration safety and rollback path

A production deployment should not proceed without both confirmations.

## Preconditions

1. Staging and production credentials are segregated.
2. Staging app is live at `https://staging.app.clawdeals.com` from the isolated `clawdeals-staging` Vercel project.
3. Staging and production use distinct Supabase, Upstash, and application secret sets.
4. Guardrail policy is acknowledged:
   - no tests against prod Supabase host `db.gztfmpuqtpvncdcuhqxy.supabase.co`.

## Step 1: Prepare Release Candidate On Staging

1. Deploy the validated `main` commit to the isolated staging Vercel project.
2. Confirm staging deployment is healthy.
3. Verify staging environment variables:
   - `SUPABASE_URL=<SUPABASE_URL_STAGING>`
   - `SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY_STAGING>`
   - API base points to `https://staging.app.clawdeals.com`.

## Step 2: Apply Staging Migrations

1. Ensure migration order is correct and complete.
2. Apply migrations to staging.
3. Confirm no migration errors and no schema drift.

Validation checks:
- Critical tables/functions exist.
- RLS policies are still enforced.
- Baseline seed data required by runtime is present.

## Step 3: Run Staging Validation Suite

Run on staging only:
1. Smoke checks.
2. Integration/E2E checks (Playwright integration project).
3. Manual console QA checklist:
   - `docs/ti-307-console-qa-checklist.md`

Expected outcome:
- All required checks pass or approved exceptions are documented.

## Step 4: Manual Approval Gate

Record a go/no-go decision with:
1. Build/commit identifier.
2. Migration versions included.
3. Validation evidence summary.
4. Risk assessment and rollback readiness.

Required approvals:
- Release owner
- Technical owner/on-call

## Step 5: Promote To Production

1. Confirm the exact staging commit is the current `main` commit.
2. Deploy app to production (`https://app.clawdeals.com`).
3. Deploy Cloudflare edge router (`npm run deploy:cloudflare`).
4. Apply the same migrations to production in the same order.

Production controls:
- Keep `CONSOLE_OPS_ENABLED` behavior intentional and reviewed.
- Do not run full integration/E2E suites on production DB.

## Step 6: Post-Deploy Smoke Subset (Production)

Run a minimal production-safe smoke subset:
1. Health/status checks.
2. Read-only endpoint checks.
3. Critical write-path sanity checks with controlled synthetic data only if explicitly approved.

Monitor:
- API error rates
- DB errors/timeouts
- queue/cron anomalies

## Rollback Strategy

Choose rollback path based on failure type.

Path A: App-only rollback
1. Revert deployment to last known good app version.
2. Keep DB at current migration if compatible.

Path B: App + DB mitigation
1. Hotfix forward with corrective migration when safe.
2. If needed, perform controlled data cleanup.
3. Use restore process only when forward-fix is impossible.

Decision ownership:
- Technical owner/on-call proposes rollback path.
- Release owner approves execution.

## Evidence To Capture For Every Release

1. Release timestamp and commit SHA.
2. List of migrations applied.
3. Staging validation results.
4. Approval log.
5. Production smoke results.
6. Any incident notes and follow-up actions.

## Related Docs

- `docs/release-environments.md`
- `docs/hosting-cloudflare-vercel.md`
- `docs/deploy-edge-router.md`
- `docs/ops-middleware.md`
- `docs/ti-307-console-qa-checklist.md`
