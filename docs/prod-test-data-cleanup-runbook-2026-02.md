# Production Test Data Cleanup Runbook (2026-02)

## Scope
- Remove E2E/integration test data from production Supabase project `gztfmpuqtpvncdcuhqxy`.
- Keep only these owners:
  - `00000000-0000-4000-a000-000000000000` (ops console)
  - `d11dc972-75bb-4cd7-8b1e-7396a8f73658` (tester #1)
  - `10ff61d9-8223-4493-a364-37e076bff457` (tester #2)
- Purge full Storage bucket `evidence`.
- Enforce guardrails to block test tooling from hitting production.

## Preconditions (Freeze Window)
1. Stop all writers to production:
- local `npm run test:integration`
- local `npm run test:e2e` / Playwright runs
- local `npm run test:smoke`
- any ad-hoc scripts using production credentials

2. Confirm freeze window start time and operator.

3. Confirm whitelist owners exist in production:
```sql
select owner_id, email
from public.owners
where owner_id in (
  '00000000-0000-4000-a000-000000000000',
  'd11dc972-75bb-4cd7-8b1e-7396a8f73658',
  '10ff61d9-8223-4493-a364-37e076bff457'
)
order by owner_id;
```

## Baseline Snapshot (Before Cleanup)
Run and save output:
```sql
select * from (
  select 'owners'::text as table_name, count(*)::bigint as rows from public.owners
  union all select 'agents', count(*)::bigint from public.agents
  union all select 'api_keys', count(*)::bigint from public.api_keys
  union all select 'deals', count(*)::bigint from public.deals
  union all select 'listings', count(*)::bigint from public.listings
  union all select 'threads', count(*)::bigint from public.threads
  union all select 'messages', count(*)::bigint from public.messages
  union all select 'offers', count(*)::bigint from public.offers
  union all select 'transactions', count(*)::bigint from public.transactions
  union all select 'escrows', count(*)::bigint from public.escrows
  union all select 'disputes', count(*)::bigint from public.disputes
  union all select 'evidence_packs', count(*)::bigint from public.evidence_packs
  union all select 'evidence_items', count(*)::bigint from public.evidence_items
  union all select 'watchlists', count(*)::bigint from public.watchlists
  union all select 'ratings', count(*)::bigint from public.ratings
  union all select 'approvals', count(*)::bigint from public.approvals
  union all select 'owner_sessions', count(*)::bigint from public.owner_sessions
  union all select 'idempotency_keys', count(*)::bigint from public.idempotency_keys
  union all select 'audit_logs_2026_02', count(*)::bigint from public.audit_logs_2026_02
  union all select 'psp_webhook_events', count(*)::bigint from public.psp_webhook_events
) s
order by rows desc, table_name;
```

Also capture Storage baseline:
```sql
select count(*)::bigint as storage_objects
from storage.objects
where bucket_id = 'evidence';
```

## Step 1: SQL Dry Run
Execute only the `DRY RUN` section from:
- `scripts/sql/prod_public_launch_cleanup_2026_02_v2.sql`

Acceptance for dry run:
- `keep_owners_existing = 3`
- `owners_target > 0`
- target counts match expected cleanup blast radius

## Step 2: SQL Execute
Execute the `EXECUTE (transactional)` section from:
- `scripts/sql/prod_public_launch_cleanup_2026_02_v2.sql`

Expected output:
- a table of `table_name` / `deleted_rows`
- no error, transaction committed

## Step 3: Purge Evidence Storage
Run:
```bash
node scripts/ops/purge-evidence-bucket.mjs
```

Optional preview:
```bash
node scripts/ops/purge-evidence-bucket.mjs --dry-run
```

## Step 4: Post-Checks
Run:
```sql
select owner_id, email
from public.owners
order by owner_id;
```
Expected: exactly the 3 whitelist owners.

```sql
select coalesce(lower(split_part(email, '@', 2)), '<null>') as domain, count(*)::bigint as owners
from public.owners
group by 1
order by owners desc, domain;
```
Expected:
- `example.com = 0`
- `<null> = 0`

```sql
select psp_provider, count(*)::bigint as rows
from public.psp_webhook_events
group by psp_provider
order by rows desc;
```
Expected: no `mock` rows remain.

```sql
select count(*)::bigint as storage_objects
from storage.objects
where bucket_id = 'evidence';
```
Expected: `0`.

```sql
select count(*)::bigint as risk_rules_count from public.risk_rules;
select count(*)::bigint as psp_config_count from public.psp_config;
```
Expected:
- `risk_rules_count = 3`
- `psp_config_count = 1`

## Step 5: Stability Re-Check
If writes resumed during cleanup window:
1. Re-run SQL dry run.
2. If non-zero targets are found, run execute section again.
3. Re-run post-checks until stable.

## Rollback / Recovery (PITR)
If critical data loss is detected:
1. Stop all writes immediately.
2. Use Supabase PITR / restore workflow for project `gztfmpuqtpvncdcuhqxy`.
3. Restore to timestamp just before cleanup execute time.
4. Re-validate with baseline snapshot queries.
5. Re-plan cleanup with narrower scope if needed.

## Notes
- Guardrail is fail-closed for integration/smoke/Playwright tooling.
- This runbook does not change public API behavior.
