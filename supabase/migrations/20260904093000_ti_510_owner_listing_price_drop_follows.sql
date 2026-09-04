-- TI-510: exact listing follows reuse agent watchlists and re-enter matching
-- whenever the asking price of a live listing decreases.

create unique index if not exists watchlists_agent_listing_follow_unique_idx
  on public.watchlists (agent_id, (criteria ->> 'listing_id'))
  where deleted_at is null
    and criteria ->> 'kind' = 'listing_follow';

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
      if old.status is distinct from 'LIVE'::public.listing_status
        and new.status = 'LIVE'::public.listing_status then
        v_reason := 'listing_status_live';
      elsif old.status = 'LIVE'::public.listing_status
        and new.status = 'LIVE'::public.listing_status
        and new.price_amount < old.price_amount then
        v_reason := 'listing_price_drop';
      else
        return new;
      end if;
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
        attempt_count = 0,
        last_error = null,
        updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists watchlist_match_queue_listings_live_v1 on public.listings;
create trigger watchlist_match_queue_listings_live_v1
after insert or update of status, price_amount on public.listings
for each row
execute function public.enqueue_watchlist_match_queue_v1();
