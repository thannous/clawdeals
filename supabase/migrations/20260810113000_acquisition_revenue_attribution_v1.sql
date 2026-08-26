-- Deterministic acquisition attribution from the first-party marketing touch
-- to backend activation and verified escrow revenue. Revenue is the released
-- platform fee; gross value is reported separately and never treated as revenue.

alter table public.acquisition_funnel_events
  add column if not exists channel text,
  add column if not exists interaction_type text;

alter table public.acquisition_funnel_events
  drop constraint if exists acquisition_funnel_events_name_check;

alter table public.acquisition_funnel_events
  add constraint acquisition_funnel_events_name_check check (
    event_name in (
      'landing_view',
      'organic_entry',
      'connect_cta_clicked',
      'activation_started',
      'agent_connected',
      'watchlist_created',
      'first_match',
      'd7_retained'
    )
  );

alter table public.acquisition_funnel_events
  drop constraint if exists acquisition_funnel_events_channel_check,
  drop constraint if exists acquisition_funnel_events_interaction_type_check;

alter table public.acquisition_funnel_events
  add constraint acquisition_funnel_events_channel_check check (
    channel is null
    or channel in (
      'direct',
      'organic_search',
      'paid_search',
      'organic_social',
      'paid_social',
      'email',
      'affiliate',
      'referral',
      'internal',
      'other'
    )
  ),
  add constraint acquisition_funnel_events_interaction_type_check check (
    interaction_type is null
    or interaction_type in ('primary_click', 'auxclick')
  );

update public.acquisition_funnel_events
set channel = case
  when source = 'direct' or medium = 'none' then 'direct'
  when source = 'internal' or medium = 'navigation' then 'internal'
  when medium = 'organic' then 'organic_search'
  when medium in ('cpc', 'ppc', 'paid_search', 'paidsearch') then 'paid_search'
  when medium in ('paid_social', 'paidsocial') then 'paid_social'
  when medium in ('social', 'organic_social') then 'organic_social'
  when medium = 'email' then 'email'
  when medium = 'affiliate' then 'affiliate'
  when medium = 'referral' then 'referral'
  else 'other'
end
where channel is null
  and source is not null
  and medium is not null;

-- Replay safety: this revision inserts activation_started_at before columns
-- already exposed by the earlier view. PostgreSQL cannot rename/reorder view
-- columns through CREATE OR REPLACE, so a clean migration replay must recreate
-- the reporting view explicitly.
drop view if exists public.acquisition_funnel_summary;

create view public.acquisition_funnel_summary
with (security_invoker = true)
as
select
  acquisition_id,
  min(occurred_at) filter (where event_name = 'landing_view') as landing_view_at,
  min(occurred_at) filter (where event_name = 'organic_entry') as organic_entry_at,
  min(occurred_at) filter (where event_name = 'connect_cta_clicked') as connect_cta_clicked_at,
  min(occurred_at) filter (where event_name = 'activation_started') as activation_started_at,
  min(occurred_at) filter (where event_name = 'agent_connected') as agent_connected_at,
  min(occurred_at) filter (where event_name = 'watchlist_created') as watchlist_created_at,
  min(occurred_at) filter (where event_name = 'first_match') as first_match_at,
  min(occurred_at) filter (where event_name = 'd7_retained') as d7_retained_at,
  max(landing_path) filter (where event_name = 'landing_view') as landing_path,
  max(locale) filter (where event_name = 'landing_view') as locale,
  max(market_code) filter (where event_name = 'landing_view') as market_code,
  max(source) filter (where event_name = 'landing_view') as source,
  max(medium) filter (where event_name = 'landing_view') as medium,
  max(campaign) filter (where event_name = 'landing_view') as campaign,
  max(channel) filter (where event_name = 'landing_view') as channel,
  max(cta_location) filter (where event_name = 'connect_cta_clicked') as cta_location,
  max(interaction_type) filter (where event_name = 'connect_cta_clicked') as interaction_type
from public.acquisition_funnel_events
group by acquisition_id;

revoke all on table public.acquisition_funnel_summary from anon, authenticated;
grant select on table public.acquisition_funnel_summary to service_role;

create table if not exists public.acquisition_revenue_attributions (
  escrow_id uuid primary key references public.escrows(escrow_id) on delete cascade,
  acquisition_id uuid,
  occurred_at timestamptz not null,
  currency text not null,
  gross_volume_minor bigint not null,
  platform_revenue_minor bigint not null,
  attribution_model text not null default 'buyer_last_touch_v1',
  created_at timestamptz not null default now(),
  constraint acquisition_revenue_amounts_non_negative_check check (
    gross_volume_minor >= 0 and platform_revenue_minor >= 0
  ),
  constraint acquisition_revenue_currency_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint acquisition_revenue_model_check check (
    attribution_model = 'buyer_last_touch_v1'
  )
);

create index if not exists acquisition_revenue_occurred_idx
  on public.acquisition_revenue_attributions (occurred_at desc);

create index if not exists acquisition_revenue_acquisition_idx
  on public.acquisition_revenue_attributions (acquisition_id, occurred_at desc)
  where acquisition_id is not null;

alter table public.acquisition_revenue_attributions enable row level security;
alter table public.acquisition_revenue_attributions force row level security;

revoke all on table public.acquisition_revenue_attributions from anon, authenticated;
grant select, insert on table public.acquisition_revenue_attributions to service_role;

drop policy if exists deny_all_anon_authenticated on public.acquisition_revenue_attributions;
create policy deny_all_anon_authenticated
on public.acquisition_revenue_attributions
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.capture_released_escrow_acquisition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_acquisition_id uuid;
  revenue_occurred_at timestamptz;
begin
  if new.status <> 'RELEASED' or old.status = 'RELEASED' then
    return new;
  end if;

  revenue_occurred_at := coalesce(new.released_at, new.updated_at, now());

  select activation.acquisition_id
    into resolved_acquisition_id
    from public.acquisition_funnel_events as activation
   where activation.event_name = 'agent_connected'
     and activation.agent_id = new.buyer_agent_id
     and activation.occurred_at <= revenue_occurred_at
   order by activation.occurred_at desc, activation.event_id desc
   limit 1;

  insert into public.acquisition_revenue_attributions (
    escrow_id,
    acquisition_id,
    occurred_at,
    currency,
    gross_volume_minor,
    platform_revenue_minor,
    attribution_model
  ) values (
    new.escrow_id,
    resolved_acquisition_id,
    revenue_occurred_at,
    upper(new.currency),
    new.amount_gross_minor,
    new.amount_platform_fee_minor,
    'buyer_last_touch_v1'
  )
  on conflict (escrow_id) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_released_escrow_acquisition() from public, anon, authenticated;
grant execute on function public.capture_released_escrow_acquisition() to service_role;

drop trigger if exists escrows_capture_acquisition_revenue on public.escrows;
create trigger escrows_capture_acquisition_revenue
after update of status on public.escrows
for each row
execute function public.capture_released_escrow_acquisition();

-- Backfill released escrows through the same buyer activation rule. Rows with
-- no eligible acquisition stay present with a null acquisition_id so coverage
-- can be reconciled instead of silently overstated.
insert into public.acquisition_revenue_attributions (
  escrow_id,
  acquisition_id,
  occurred_at,
  currency,
  gross_volume_minor,
  platform_revenue_minor,
  attribution_model
)
select
  escrow.escrow_id,
  touch.acquisition_id,
  coalesce(escrow.released_at, escrow.updated_at),
  upper(escrow.currency),
  escrow.amount_gross_minor,
  escrow.amount_platform_fee_minor,
  'buyer_last_touch_v1'
from public.escrows as escrow
left join lateral (
  select activation.acquisition_id
  from public.acquisition_funnel_events as activation
  where activation.event_name = 'agent_connected'
    and activation.agent_id = escrow.buyer_agent_id
    and activation.occurred_at <= coalesce(escrow.released_at, escrow.updated_at)
  order by activation.occurred_at desc, activation.event_id desc
  limit 1
) as touch on true
where escrow.status = 'RELEASED'
on conflict (escrow_id) do nothing;

create or replace view public.acquisition_revenue_attribution_summary
with (security_invoker = true)
as
select
  revenue.escrow_id,
  revenue.acquisition_id,
  revenue.occurred_at,
  revenue.currency,
  revenue.gross_volume_minor,
  revenue.platform_revenue_minor,
  revenue.attribution_model,
  funnel.source,
  funnel.medium,
  funnel.channel,
  funnel.campaign,
  funnel.cta_location,
  funnel.interaction_type
from public.acquisition_revenue_attributions as revenue
left join public.acquisition_funnel_summary as funnel
  on funnel.acquisition_id = revenue.acquisition_id;

revoke all on table public.acquisition_revenue_attribution_summary from anon, authenticated;
grant select on table public.acquisition_revenue_attribution_summary to service_role;
