-- TI-289: Observability helper views (v1)
-- These views are intended for ops dashboards (Supabase Studio, Grafana, etc.).
--
-- They rely on audit payload fields:
-- - audit_logs.action.route_group
-- - audit_logs.request.duration_ms
-- - audit_logs.request.status_code
-- - audit_logs.rate_limit.scope / audit_logs.rate_limit.identity (for 429 attribution)

-- (1) Latency p50/p95/p99 per action.route_group (hourly)
create or replace view public.ops_obs_route_group_latency_hourly_v1 as
with base as (
  select
    date_trunc('hour', occurred_at) as hour,
    coalesce(nullif(action->>'route_group', ''), 'unknown') as route_group,
    nullif(request->>'duration_ms', '')::numeric as duration_ms,
    nullif(request->>'status_code', '')::int as status_code
  from public.audit_logs
  -- Exclude pre-instrumentation rows (missing status_code), otherwise totals become misleading.
  where nullif(request->>'status_code', '') is not null
)
select
  hour,
  route_group,
  count(*) as total_requests,
  count(*) filter (where status_code between 200 and 399) as success_requests,
  percentile_cont(0.50) within group (order by duration_ms)
    filter (where status_code between 200 and 399 and duration_ms is not null) as p50_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms)
    filter (where status_code between 200 and 399 and duration_ms is not null) as p95_duration_ms,
  percentile_cont(0.99) within group (order by duration_ms)
    filter (where status_code between 200 and 399 and duration_ms is not null) as p99_duration_ms
from base
group by hour, route_group;

-- (2) 4xx/5xx/429 breakdown per route_group (hourly)
create or replace view public.ops_obs_route_group_http_breakdown_hourly_v1 as
with base as (
  select
    date_trunc('hour', occurred_at) as hour,
    coalesce(nullif(action->>'route_group', ''), 'unknown') as route_group,
    nullif(request->>'status_code', '')::int as status_code
  from public.audit_logs
  where nullif(request->>'status_code', '') is not null
)
select
  hour,
  route_group,
  count(*) as total_requests,
  count(*) filter (where status_code between 200 and 399) as http2xx_3xx_requests,
  count(*) filter (where status_code between 400 and 499 and status_code <> 429) as http4xx_non429_requests,
  count(*) filter (where status_code = 429) as http429_requests,
  count(*) filter (where status_code between 500 and 599) as http5xx_requests,
  round(
    100.0 * (count(*) filter (where status_code between 400 and 499 and status_code <> 429)) / nullif(count(*), 0),
    4
  ) as http4xx_non429_rate_pct,
  round(
    100.0 * (count(*) filter (where status_code = 429)) / nullif(count(*), 0),
    4
  ) as http429_rate_pct,
  round(
    100.0 * (count(*) filter (where status_code between 500 and 599)) / nullif(count(*), 0),
    4
  ) as http5xx_rate_pct
from base
group by hour, route_group;

-- (3) 429 top agents/identities (last 24h)
create or replace view public.ops_obs_429_top_identities_24h_v1 as
with base as (
  select
    coalesce(nullif(action->>'route_group', ''), 'unknown') as route_group,
    coalesce(nullif(rate_limit->>'scope', ''), 'unknown') as scope,
    coalesce(nullif(rate_limit->>'identity', ''), 'unknown') as identity,
    nullif(auth->>'agent_id', '') as agent_id,
    nullif(auth->>'owner_id', '') as owner_id,
    nullif(request->>'status_code', '')::int as status_code
  from public.audit_logs
  where occurred_at >= now() - interval '24 hours'
    and nullif(request->>'status_code', '') is not null
),
agg as (
  select
    route_group,
    scope,
    identity,
    agent_id,
    owner_id,
    count(*) as http429_requests
  from base
  where status_code = 429
  group by route_group, scope, identity, agent_id, owner_id
)
select
  route_group,
  scope,
  identity,
  agent_id,
  owner_id,
  http429_requests,
  row_number() over (order by http429_requests desc, route_group asc, scope asc, identity asc) as rank_overall,
  row_number() over (partition by route_group order by http429_requests desc, scope asc, identity asc) as rank_in_route_group
from agg;

-- (4) Queue depth gauges (approvals + job queues)
create or replace view public.ops_obs_queue_depth_gauges_v1 as
with queues as (
  select
    'approvals_pending'::text as queue_name,
    count(*)::bigint as depth,
    min(created_at) as oldest_item_at
  from public.approvals
  where state = 'PENDING'
  union all
  select
    'trustscore_recalc_queue'::text as queue_name,
    count(*)::bigint as depth,
    min(updated_at) as oldest_item_at
  from public.trustscore_recalc_queue
  union all
  select
    'watchlist_backfill_queue'::text as queue_name,
    count(*)::bigint as depth,
    min(updated_at) as oldest_item_at
  from public.watchlist_backfill_queue
)
select
  now() as observed_at,
  queue_name,
  depth,
  oldest_item_at,
  case
    when oldest_item_at is null then null
    else extract(epoch from (now() - oldest_item_at))
  end as oldest_age_seconds
from queues;

-- Defense-in-depth:
-- On Postgres 15+, mark these as SECURITY INVOKER views so underlying RLS is evaluated for the caller
-- (and not the view owner), even if grants change later.
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.ops_obs_route_group_latency_hourly_v1 set (security_invoker = true)';
    execute 'alter view public.ops_obs_route_group_http_breakdown_hourly_v1 set (security_invoker = true)';
    execute 'alter view public.ops_obs_429_top_identities_24h_v1 set (security_invoker = true)';
    execute 'alter view public.ops_obs_queue_depth_gauges_v1 set (security_invoker = true)';
  end if;
end $$;

-- Defense-in-depth continued:
-- 1) Explicitly revoke view access from common PostgREST roles.
-- 2) Grant only to service_role (expected caller for ops dashboards).
revoke all on table public.ops_obs_route_group_latency_hourly_v1 from public;
revoke all on table public.ops_obs_route_group_latency_hourly_v1 from anon;
revoke all on table public.ops_obs_route_group_latency_hourly_v1 from authenticated;

revoke all on table public.ops_obs_route_group_http_breakdown_hourly_v1 from public;
revoke all on table public.ops_obs_route_group_http_breakdown_hourly_v1 from anon;
revoke all on table public.ops_obs_route_group_http_breakdown_hourly_v1 from authenticated;

revoke all on table public.ops_obs_429_top_identities_24h_v1 from public;
revoke all on table public.ops_obs_429_top_identities_24h_v1 from anon;
revoke all on table public.ops_obs_429_top_identities_24h_v1 from authenticated;

revoke all on table public.ops_obs_queue_depth_gauges_v1 from public;
revoke all on table public.ops_obs_queue_depth_gauges_v1 from anon;
revoke all on table public.ops_obs_queue_depth_gauges_v1 from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.ops_obs_route_group_latency_hourly_v1 to service_role;
    grant select on table public.ops_obs_route_group_http_breakdown_hourly_v1 to service_role;
    grant select on table public.ops_obs_429_top_identities_24h_v1 to service_role;
    grant select on table public.ops_obs_queue_depth_gauges_v1 to service_role;
  end if;
end $$;

