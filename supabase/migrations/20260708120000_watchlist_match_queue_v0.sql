-- Watchlist match queue v0
--
-- Asynchronously matches newly-created deals and newly-live listings.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

create table if not exists public.watchlist_match_queue (
  entity_type text not null,
  entity_id uuid not null,
  last_reason text,
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id),
  constraint watchlist_match_queue_entity_type_check
    check (entity_type in ('deal', 'listing')),
  constraint watchlist_match_queue_attempt_count_check
    check (attempt_count >= 0)
);

create index if not exists watchlist_match_queue_updated_at_idx
  on public.watchlist_match_queue (updated_at asc, entity_type asc, entity_id asc);

alter table public.watchlist_match_queue enable row level security;
alter table public.watchlist_match_queue force row level security;

drop policy if exists deny_all_anon_authenticated on public.watchlist_match_queue;
create policy deny_all_anon_authenticated
on public.watchlist_match_queue
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.enqueue_watchlist_match_queue_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_reason text;
begin
  if tg_table_name = 'deals' then
    if tg_op <> 'INSERT' then
      return new;
    end if;

    v_entity_type := 'deal';
    v_entity_id := new.deal_id;
    v_reason := 'deal_insert';
  elsif tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      if new.status is distinct from 'LIVE'::public.listing_status then
        return new;
      end if;
      v_reason := 'listing_insert_live';
    elsif tg_op = 'UPDATE' then
      if not (
        old.status is distinct from 'LIVE'::public.listing_status
        and new.status = 'LIVE'::public.listing_status
      ) then
        return new;
      end if;
      v_reason := 'listing_status_live';
    else
      return new;
    end if;

    v_entity_type := 'listing';
    v_entity_id := new.listing_id;
  else
    return new;
  end if;

  if v_entity_id is null then
    return new;
  end if;

  insert into public.watchlist_match_queue (
    entity_type,
    entity_id,
    last_reason,
    attempt_count,
    last_error,
    created_at,
    updated_at
  )
  values (
    v_entity_type,
    v_entity_id,
    v_reason,
    0,
    null,
    now(),
    now()
  )
  on conflict (entity_type, entity_id) do update
    set last_reason = excluded.last_reason,
        last_error = null,
        updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists watchlist_match_queue_deals_insert_v1 on public.deals;
create trigger watchlist_match_queue_deals_insert_v1
after insert on public.deals
for each row
execute function public.enqueue_watchlist_match_queue_v1();

drop trigger if exists watchlist_match_queue_listings_live_v1 on public.listings;
create trigger watchlist_match_queue_listings_live_v1
after insert or update of status on public.listings
for each row
execute function public.enqueue_watchlist_match_queue_v1();
