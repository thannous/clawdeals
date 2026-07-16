-- Single-stack launch markets for France, Great Britain, and Spain.
--
-- Historical USD rows are retained as INTL so this additive migration never
-- rewrites monetary values. New application writes only target FR/GB/ES.

alter table public.deals
  add column if not exists market_code text;

alter table public.listings
  add column if not exists market_code text;

alter table public.watchlists
  add column if not exists market_code text,
  add column if not exists currency char(3);

update public.deals
set market_code = case
  when upper(coalesce(country, '')) in ('FR', 'GB', 'ES') then upper(country)
  when upper(coalesce(currency, '')) = 'GBP' then 'GB'
  when upper(coalesce(currency, '')) = 'EUR' then 'FR'
  else 'INTL'
end
where market_code is null;

update public.listings
set market_code = case
  when upper(coalesce(currency, '')) = 'GBP' then 'GB'
  when upper(coalesce(currency, '')) = 'EUR' then 'FR'
  else 'INTL'
end
where market_code is null;

update public.watchlists
set
  market_code = coalesce(market_code, 'FR'),
  currency = coalesce(currency, 'EUR')
where market_code is null or currency is null;

alter table public.deals
  alter column market_code set default 'FR',
  alter column market_code set not null;

alter table public.listings
  alter column market_code set default 'FR',
  alter column market_code set not null;

alter table public.watchlists
  alter column market_code set default 'FR',
  alter column market_code set not null,
  alter column currency set default 'EUR',
  alter column currency set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_market_code_check') then
    alter table public.deals
      add constraint deals_market_code_check
      check (market_code in ('FR', 'GB', 'ES', 'INTL'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'deals_market_currency_check') then
    alter table public.deals
      add constraint deals_market_currency_check
      check (
        market_code = 'INTL'
        or (market_code in ('FR', 'ES') and currency = 'EUR')
        or (market_code = 'GB' and currency = 'GBP')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'listings_market_code_check') then
    alter table public.listings
      add constraint listings_market_code_check
      check (market_code in ('FR', 'GB', 'ES', 'INTL'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'listings_market_currency_check') then
    alter table public.listings
      add constraint listings_market_currency_check
      check (
        market_code = 'INTL'
        or (market_code in ('FR', 'ES') and currency = 'EUR')
        or (market_code = 'GB' and currency = 'GBP')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'watchlists_market_code_check') then
    alter table public.watchlists
      add constraint watchlists_market_code_check
      check (market_code in ('FR', 'GB', 'ES'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'watchlists_market_currency_check') then
    alter table public.watchlists
      add constraint watchlists_market_currency_check
      check (
        (market_code in ('FR', 'ES') and currency = 'EUR')
        or (market_code = 'GB' and currency = 'GBP')
      );
  end if;
end $$;

-- Equality columns first, then status/range columns used by market feeds and
-- the asynchronous watchlist candidate selection path.
create index if not exists deals_market_status_created_idx
  on public.deals (market_code, status, created_at desc);

create index if not exists listings_market_status_created_idx
  on public.listings (market_code, status, created_at desc);

-- The previous active-listing uniqueness key was global. Replace it only after
-- the market-scoped key exists so identical listings can coexist across markets.
create unique index if not exists listings_market_duplicate_unique_active_idx
  on public.listings (market_code, duplicate_fingerprint)
  where duplicate_override = false
    and duplicate_fingerprint is not null
    and status in ('LIVE', 'PENDING_APPROVAL', 'RESERVED', 'CONTACT_REVEALED');

drop index if exists public.listings_duplicate_unique_active_idx;

create index if not exists watchlists_market_active_created_idx
  on public.watchlists (market_code, active, created_at desc)
  where deleted_at is null;

create index if not exists watchlists_market_price_active_idx
  on public.watchlists (market_code, currency, price_max)
  where active = true and deleted_at is null and price_max is not null;

create or replace view public.ops_obs_market_gauges_v1 as
with markets(market_code) as (
  values ('FR'::text), ('GB'::text), ('ES'::text)
), queue_entities as (
  select q.updated_at, d.market_code
  from public.watchlist_match_queue q
  join public.deals d
    on q.entity_type = 'deal' and d.deal_id = q.entity_id
  union all
  select q.updated_at, l.market_code
  from public.watchlist_match_queue q
  join public.listings l
    on q.entity_type = 'listing' and l.listing_id = q.entity_id
), match_entities as (
  select wm.matched_at, d.market_code
  from public.watchlist_matches wm
  join public.deals d
    on wm.entity_type = 'deal' and d.deal_id = wm.entity_id
  union all
  select wm.matched_at, l.market_code
  from public.watchlist_matches wm
  join public.listings l
    on wm.entity_type = 'listing' and l.listing_id = wm.entity_id
), notification_entities as (
  select no.status, no.last_error, d.market_code
  from public.notification_outbox no
  join public.deals d
    on no.entity_type = 'deal' and d.deal_id = no.entity_id
  union all
  select no.status, no.last_error, l.market_code
  from public.notification_outbox no
  join public.listings l
    on no.entity_type = 'listing' and l.listing_id = no.entity_id
)
select
  now() as observed_at,
  m.market_code,
  (select count(*) from public.deals d where d.market_code = m.market_code)::bigint as deals_total,
  (select count(*) from public.listings l where l.market_code = m.market_code)::bigint as listings_total,
  (
    select count(*) from public.watchlists w
    where w.market_code = m.market_code and w.active = true and w.deleted_at is null
  )::bigint as watchlists_active,
  (select count(*) from queue_entities q where q.market_code = m.market_code)::bigint as match_queue_depth,
  (select min(updated_at) from queue_entities q where q.market_code = m.market_code) as match_queue_oldest_at,
  (
    select count(*) from match_entities me
    where me.market_code = m.market_code and me.matched_at >= now() - interval '24 hours'
  )::bigint as matches_24h,
  (
    select count(*) from notification_entities ne
    where ne.market_code = m.market_code and ne.status = 'PENDING'
  )::bigint as notifications_pending,
  (
    select count(*) from notification_entities ne
    where ne.market_code = m.market_code and ne.last_error is not null
  )::bigint as notification_errors
from markets m;

do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.ops_obs_market_gauges_v1 set (security_invoker = true)';
  end if;
end $$;

revoke all on table public.ops_obs_market_gauges_v1 from public;
revoke all on table public.ops_obs_market_gauges_v1 from anon;
revoke all on table public.ops_obs_market_gauges_v1 from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.ops_obs_market_gauges_v1 to service_role;
  end if;
end $$;
