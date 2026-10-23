-- Markets and currencies are matching criteria, including when changed without
-- a criteria JSON update. Keep old transition baselines to explain future alerts.
create or replace function public.record_smartphone_mission_match_v1(
  p_watchlist_id uuid, p_listing_id uuid, p_listing_snapshot jsonb,
  p_watchlist_updated_at timestamptz, p_criteria jsonb, p_passport_revision integer,
  p_compatible boolean, p_reason jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_listing public.listings;
  v_watchlist public.watchlists;
  v_revision integer;
  v_old public.smartphone_mission_match_state;
  v_snapshot jsonb;
  v_reason jsonb;
  v_match public.watchlist_matches;
  v_compatible boolean;
begin
  -- Same first lock as passport saves. Compare every evaluated listing field,
  -- including price/geo, rather than relying on application-maintained timestamps.
  select * into v_listing from public.listings where listing_id = p_listing_id for update;
  if not found then return jsonb_build_object('stale', true); end if;
  select * into v_watchlist from public.watchlists where watchlist_id = p_watchlist_id for update;
  if not found then return jsonb_build_object('stale', true); end if;
  select revision into v_revision from public.smartphone_passports where listing_id = p_listing_id;
  if p_listing_snapshot is null or jsonb_typeof(p_listing_snapshot) <> 'object'
    or not (to_jsonb(v_listing) @> p_listing_snapshot)
    or v_watchlist.updated_at is distinct from p_watchlist_updated_at
    or v_watchlist.criteria is distinct from p_criteria
    or coalesce(v_revision, 0) is distinct from p_passport_revision then
    return jsonb_build_object('stale', true);
  end if;
  if jsonb_typeof(v_watchlist.criteria #> '{mission,smartphone}') is distinct from 'object' then
    return jsonb_build_object('stale', true);
  end if;
  if p_compatible is null or p_reason is null or jsonb_typeof(p_reason) <> 'object'
    or octet_length(p_reason::text) > 12000
    or (p_compatible and p_reason #>> '{smartphone,status}' is distinct from 'compatible') then
    raise exception 'SMARTPHONE_MISSION_INVALID';
  end if;
  v_compatible := p_compatible and v_listing.status::text = 'LIVE'
    and v_watchlist.active and v_watchlist.deleted_at is null
    and coalesce(v_listing.market_code = v_watchlist.market_code
      and v_listing.currency = v_watchlist.currency
      and v_listing.currency = (v_watchlist.criteria #>> '{mission,currency}'), false)
    and (v_watchlist.criteria #>> '{mission,expires_at}')::timestamptz > now()
    and not exists (select 1 from public.agents where id = v_watchlist.agent_id and suspended_at is not null)
    and not exists (select 1 from public.moderation_states where entity_type = 'listing' and entity_id = p_listing_id and hidden);
  select * into v_old from public.smartphone_mission_match_state
    where watchlist_id = p_watchlist_id and listing_id = p_listing_id for update;
  v_snapshot := jsonb_build_object('price', v_listing.price_amount, 'currency', v_listing.currency,
    'passport_revision', coalesce(v_revision, 0), 'criteria', v_watchlist.criteria,
    'market_code', v_listing.market_code, 'watchlist_market_code', v_watchlist.market_code,
    'watchlist_currency', v_watchlist.currency);
  insert into public.smartphone_mission_match_state(watchlist_id, listing_id, compatible, snapshot)
    values(p_watchlist_id, p_listing_id, v_compatible, v_snapshot)
    on conflict(watchlist_id, listing_id) do update set compatible = excluded.compatible,
      snapshot = excluded.snapshot, updated_at = clock_timestamp();
  if not v_compatible then
    delete from public.watchlist_matches where watchlist_id = p_watchlist_id and entity_type = 'listing' and entity_id = p_listing_id;
    return jsonb_build_object('stale', false, 'matched', false, 'alert', null);
  end if;
  if coalesce(v_old.compatible, false) then
    return jsonb_build_object('stale', false, 'matched', true, 'alert', null);
  end if;
  v_reason := p_reason || jsonb_build_object('change', case
    when v_old.watchlist_id is null then 'first_match'
    when v_old.snapshot->'criteria' is distinct from v_snapshot->'criteria'
      or (v_old.snapshot ? 'watchlist_market_code' and v_old.snapshot->'watchlist_market_code' is distinct from v_snapshot->'watchlist_market_code')
      or (v_old.snapshot ? 'watchlist_currency' and v_old.snapshot->'watchlist_currency' is distinct from v_snapshot->'watchlist_currency') then 'criteria_changed'
    when v_old.snapshot->'price' is distinct from v_snapshot->'price' then 'price_changed'
    when v_old.snapshot->'passport_revision' is distinct from v_snapshot->'passport_revision' then 'passport_updated'
    else 'first_match' end, 'current_price', v_listing.price_amount,
    'passport_revision', coalesce(v_revision, 0));
  if v_old.watchlist_id is not null and v_old.snapshot->'currency' = v_snapshot->'currency' then
    v_reason := v_reason || jsonb_build_object('previous_price', v_old.snapshot->'price');
  end if;
  insert into public.watchlist_matches(watchlist_id, agent_id, entity_type, entity_id, matched_at, reason, delivered_at)
    values(p_watchlist_id, v_watchlist.agent_id, 'listing', p_listing_id, clock_timestamp(), v_reason, null)
    on conflict(watchlist_id, entity_type, entity_id) do update set matched_at = excluded.matched_at,
      reason = excluded.reason, delivered_at = null
    returning * into v_match;
  return jsonb_build_object('stale', false, 'matched', true, 'alert', to_jsonb(v_match));
end;
$$;
revoke all on function public.record_smartphone_mission_match_v1(uuid,uuid,jsonb,timestamptz,jsonb,integer,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.record_smartphone_mission_match_v1(uuid,uuid,jsonb,timestamptz,jsonb,integer,boolean,jsonb) to service_role;

create or replace function public.enqueue_smartphone_mission_change_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_listing_id uuid; v_invalidate boolean := false;
begin
  if tg_table_name = 'smartphone_passports' then
    v_listing_id := coalesce(new.listing_id, old.listing_id);
  elsif tg_table_name = 'listings' then
    v_listing_id := new.listing_id;
    -- Previous-market missions are no longer candidates once the listing moves.
    -- Invalidate their retained baseline and alerts in this same transaction.
    v_invalidate := new.status::text <> 'LIVE' or new.market_code is distinct from old.market_code
      or new.currency is distinct from old.currency;
    if not exists(select 1 from public.watchlists where criteria #> '{mission,smartphone}' is not null and deleted_at is null)
      and not exists(select 1 from public.smartphone_mission_match_state where listing_id = v_listing_id) then return new; end if;
  elsif tg_table_name = 'moderation_states' then
    if coalesce(new.entity_type, old.entity_type) <> 'listing' then return coalesce(new, old); end if;
    v_listing_id := coalesce(new.entity_id, old.entity_id);
    v_invalidate := coalesce(new.hidden, false);
    -- Serialize visibility changes with the transition recorder. Existing writes
    -- retain their permissions; this trigger grants no access to callers.
    perform 1 from public.listings where listing_id = v_listing_id for update;
  end if;
  if v_invalidate then
    update public.smartphone_mission_match_state set compatible = false, updated_at = clock_timestamp() where listing_id = v_listing_id;
    delete from public.watchlist_matches m using public.smartphone_mission_match_state s
      where s.listing_id = v_listing_id and m.watchlist_id = s.watchlist_id and m.entity_type = 'listing' and m.entity_id = v_listing_id;
  end if;
  insert into public.watchlist_match_queue(entity_type,entity_id,last_reason,updated_at)
    values('listing',v_listing_id,'smartphone_mission_change',clock_timestamp())
    on conflict(entity_type,entity_id) do update set last_reason = excluded.last_reason,
      updated_at = excluded.updated_at, attempt_count = 0, last_error = null;
  return coalesce(new, old);
end;
$$;
revoke all on function public.enqueue_smartphone_mission_change_v1() from public, anon, authenticated;
grant execute on function public.enqueue_smartphone_mission_change_v1() to service_role;
create or replace function public.enqueue_smartphone_mission_criteria_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.criteria #> '{mission,smartphone}' is null and old.criteria #> '{mission,smartphone}' is null then return new; end if;
  if new.criteria is distinct from old.criteria or new.active is distinct from old.active or new.deleted_at is distinct from old.deleted_at
    or new.market_code is distinct from old.market_code or new.currency is distinct from old.currency then
    update public.smartphone_mission_match_state set compatible = false, updated_at = clock_timestamp() where watchlist_id = new.watchlist_id;
    delete from public.watchlist_matches where watchlist_id = new.watchlist_id;
    insert into public.watchlist_backfill_queue(watchlist_id,updated_at) values(new.watchlist_id,clock_timestamp())
      on conflict(watchlist_id) do update set updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_smartphone_mission_criteria_v1() from public, anon, authenticated;
grant execute on function public.enqueue_smartphone_mission_criteria_v1() to service_role;
drop trigger smartphone_mission_criteria_change on public.watchlists;
create trigger smartphone_mission_criteria_change after update of criteria,active,deleted_at,market_code,currency on public.watchlists
  for each row execute function public.enqueue_smartphone_mission_criteria_v1();

-- Preserve the existing recorder's timestamp CAS even for direct SQL writes or
-- a market round trip in one application clock tick. Do not change other lists.
create function public.advance_smartphone_mission_market_clock_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.criteria #> '{mission,smartphone}' is not null or old.criteria #> '{mission,smartphone}' is not null)
    and (new.market_code is distinct from old.market_code or new.currency is distinct from old.currency) then
    new.updated_at := greatest(new.updated_at, clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$$;
revoke all on function public.advance_smartphone_mission_market_clock_v1() from public, anon, authenticated;
grant execute on function public.advance_smartphone_mission_market_clock_v1() to service_role;
create trigger smartphone_mission_market_clock before update of market_code,currency on public.watchlists
  for each row execute function public.advance_smartphone_mission_market_clock_v1();
