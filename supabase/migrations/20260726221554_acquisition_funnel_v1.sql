-- Privacy-minimized acquisition funnel for marketing -> first product value.
-- Public clients never access this table directly: events are accepted by a
-- rate-limited server endpoint and written with the service role.

create extension if not exists "pgcrypto";

create table if not exists public.acquisition_funnel_events (
  event_id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null,
  event_name text not null,
  occurred_at timestamptz not null default now(),
  landing_path text,
  locale text,
  market_code text,
  source text,
  medium text,
  campaign text,
  referrer_host text,
  cta_location text,
  connect_session_id uuid references public.connect_sessions(session_id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  watchlist_id uuid references public.watchlists(watchlist_id) on delete set null,
  watchlist_match_id uuid references public.watchlist_matches(watchlist_match_id) on delete set null,
  constraint acquisition_funnel_events_name_check check (
    event_name in (
      'landing_view',
      'organic_entry',
      'connect_cta_clicked',
      'agent_connected',
      'watchlist_created',
      'first_match',
      'd7_retained'
    )
  ),
  constraint acquisition_funnel_events_landing_path_check check (
    landing_path is null
    or (
      char_length(landing_path) between 1 and 200
      and landing_path like '/%'
    )
  ),
  constraint acquisition_funnel_events_locale_check check (
    locale is null or locale in ('en', 'fr', 'es')
  ),
  constraint acquisition_funnel_events_market_check check (
    market_code is null or market_code in ('FR', 'GB', 'ES')
  ),
  constraint acquisition_funnel_events_source_check check (
    source is null or char_length(source) between 1 and 80
  ),
  constraint acquisition_funnel_events_medium_check check (
    medium is null or char_length(medium) between 1 and 80
  ),
  constraint acquisition_funnel_events_campaign_check check (
    campaign is null or char_length(campaign) between 1 and 80
  ),
  constraint acquisition_funnel_events_referrer_host_check check (
    referrer_host is null or char_length(referrer_host) between 1 and 255
  ),
  constraint acquisition_funnel_events_cta_check check (
    cta_location is null
    or cta_location in (
      'navbar',
      'hero',
      'showcase_deals',
      'showcase_marketplace',
      'feature_footer',
      'explore_card',
      'explore_footer',
      'mcp',
      'browse',
      'other'
    )
  ),
  unique (acquisition_id, event_name)
);

create index if not exists acquisition_funnel_events_occurred_idx
  on public.acquisition_funnel_events (occurred_at desc);

create index if not exists acquisition_funnel_events_agent_occurred_idx
  on public.acquisition_funnel_events (agent_id, occurred_at desc)
  where agent_id is not null;

alter table public.acquisition_funnel_events enable row level security;
alter table public.acquisition_funnel_events force row level security;

revoke all on table public.acquisition_funnel_events from anon, authenticated;
grant select, insert on table public.acquisition_funnel_events to service_role;

drop policy if exists deny_all_anon_authenticated on public.acquisition_funnel_events;
create policy deny_all_anon_authenticated
on public.acquisition_funnel_events
for all
to anon, authenticated
using (false)
with check (false);

alter table public.connect_sessions
  add column if not exists acquisition_id uuid;

create index if not exists connect_sessions_acquisition_idx
  on public.connect_sessions (acquisition_id, delivered_at desc)
  where acquisition_id is not null;

create or replace function public.capture_acquisition_d7_retention()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_agent_id uuid;
begin
  if new.outcome <> 'SUCCESS' then
    return new;
  end if;

  begin
    resolved_agent_id := nullif(new.auth ->> 'agent_id', '')::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  if resolved_agent_id is null then
    return new;
  end if;

  insert into public.acquisition_funnel_events (
    acquisition_id,
    event_name,
    occurred_at,
    agent_id,
    market_code
  )
  select
    first_match.acquisition_id,
    'd7_retained',
    new.occurred_at,
    resolved_agent_id,
    first_match.market_code
  from public.acquisition_funnel_events as first_match
  where first_match.event_name = 'first_match'
    and first_match.agent_id = resolved_agent_id
    and new.occurred_at >= first_match.occurred_at + interval '7 days'
  order by first_match.occurred_at desc
  limit 1
  on conflict (acquisition_id, event_name) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_acquisition_d7_retention() from public, anon, authenticated;
grant execute on function public.capture_acquisition_d7_retention() to service_role;

drop trigger if exists audit_logs_capture_acquisition_d7 on public.audit_logs;
create trigger audit_logs_capture_acquisition_d7
after insert on public.audit_logs
for each row
execute function public.capture_acquisition_d7_retention();

create or replace view public.acquisition_funnel_summary
with (security_invoker = true)
as
select
  acquisition_id,
  min(occurred_at) filter (where event_name = 'landing_view') as landing_view_at,
  min(occurred_at) filter (where event_name = 'organic_entry') as organic_entry_at,
  min(occurred_at) filter (where event_name = 'connect_cta_clicked') as connect_cta_clicked_at,
  min(occurred_at) filter (where event_name = 'agent_connected') as agent_connected_at,
  min(occurred_at) filter (where event_name = 'watchlist_created') as watchlist_created_at,
  min(occurred_at) filter (where event_name = 'first_match') as first_match_at,
  min(occurred_at) filter (where event_name = 'd7_retained') as d7_retained_at,
  max(landing_path) filter (where event_name = 'landing_view') as landing_path,
  max(locale) filter (where event_name = 'landing_view') as locale,
  max(market_code) filter (where event_name = 'landing_view') as market_code,
  max(source) filter (where event_name = 'landing_view') as source,
  max(medium) filter (where event_name = 'landing_view') as medium,
  max(campaign) filter (where event_name = 'landing_view') as campaign
from public.acquisition_funnel_events
group by acquisition_id;

revoke all on table public.acquisition_funnel_summary from anon, authenticated;
grant select on table public.acquisition_funnel_summary to service_role;
