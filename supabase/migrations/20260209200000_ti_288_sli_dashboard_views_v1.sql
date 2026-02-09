-- TI-288: SLI dashboard helper views (v1)
-- These views are intended for ops dashboards (Supabase Studio, Grafana, etc.).
-- They rely on audit payload fields added in TI-288:
-- - audit_logs.request.duration_ms
-- - audit_logs.request.status_code

create or replace view public.ops_sli_api_write_journeys_daily_v1 as
with base as (
  select
    date_trunc('day', occurred_at)::date as day,
    action->>'event' as event,
    nullif(request->>'duration_ms', '')::numeric as duration_ms,
    nullif(request->>'status_code', '')::int as status_code
  from public.audit_logs
  where action->>'event' in ('deal.create', 'listing.create', 'offer.create')
    -- Exclude pre-instrumentation rows (pre TI-288) where status_code is missing,
    -- so success_rate_pct does not get artificially depressed.
    and nullif(request->>'status_code', '') is not null
)
select
  day,
  event,
  count(*) as total_requests,
  count(*) filter (where status_code between 200 and 399) as success_requests,
  round(
    100.0 * (count(*) filter (where status_code between 200 and 399)) / nullif(count(*), 0),
    4
  ) as success_rate_pct,
  percentile_cont(0.95) within group (order by duration_ms)
    filter (where status_code between 200 and 399 and duration_ms is not null) as p95_duration_ms
from base
group by day, event;

create or replace view public.ops_sli_approvals_resolve_daily_v1 as
with resolved as (
  select
    date_trunc('day', resolved_at)::date as day,
    (resolved_at - created_at) as resolve_time
  from public.approvals
  where resolved_at is not null
)
select
  day,
  count(*) as resolved_approvals,
  percentile_cont(0.95) within group (order by extract(epoch from resolve_time)) as p95_resolve_seconds,
  round(
    100.0 * sum(case when resolve_time <= interval '4 hours' then 1 else 0 end) / nullif(count(*), 0),
    4
  ) as within_4h_pct
from resolved
group by day;

-- Defense-in-depth:
-- On Postgres 15+, mark these as SECURITY INVOKER views so underlying RLS is evaluated for the caller
-- (and not the view owner), even if grants change later.
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.ops_sli_api_write_journeys_daily_v1 set (security_invoker = true)';
    execute 'alter view public.ops_sli_approvals_resolve_daily_v1 set (security_invoker = true)';
  end if;
end $$;

-- Defense-in-depth continued:
-- 1) Explicitly revoke view access from common PostgREST roles.
-- 2) Grant only to service_role (expected caller for ops dashboards).
revoke all on table public.ops_sli_api_write_journeys_daily_v1 from public;
revoke all on table public.ops_sli_api_write_journeys_daily_v1 from anon;
revoke all on table public.ops_sli_api_write_journeys_daily_v1 from authenticated;

revoke all on table public.ops_sli_approvals_resolve_daily_v1 from public;
revoke all on table public.ops_sli_approvals_resolve_daily_v1 from anon;
revoke all on table public.ops_sli_approvals_resolve_daily_v1 from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.ops_sli_api_write_journeys_daily_v1 to service_role;
    grant select on table public.ops_sli_approvals_resolve_daily_v1 to service_role;
  end if;
end $$;
