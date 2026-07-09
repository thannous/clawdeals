-- Watchlist match queue observability helper view wiring.
--
-- This migration intentionally runs after watchlist_match_queue exists so fresh
-- database migrations do not make the older TI-289 helper-view migration depend
-- on a future table.

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
  union all
  select
    'watchlist_match_queue'::text as queue_name,
    count(*)::bigint as depth,
    min(updated_at) as oldest_item_at
  from public.watchlist_match_queue
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

do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.ops_obs_queue_depth_gauges_v1 set (security_invoker = true)';
  end if;
end $$;

revoke all on table public.ops_obs_queue_depth_gauges_v1 from public;
revoke all on table public.ops_obs_queue_depth_gauges_v1 from anon;
revoke all on table public.ops_obs_queue_depth_gauges_v1 from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.ops_obs_queue_depth_gauges_v1 to service_role;
  end if;
end $$;
