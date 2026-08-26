-- TI-367: Attach a buy mission to offers and let the non-proposing
-- participant accept under seller policy or buyer-mission constraints.
--
-- Append-only on top of 20260713010000_security_offer_invariants.sql:
-- - offers.buy_mission_id is nullable and points at watchlists
-- - counter_offer_v0 copies the mission onto the new offer
-- - offer_accept_v0 lets the seller accept a buyer offer, and the buyer
--   accept a seller counter only when the linked BUY mission still
--   authorizes make_offer within hard_budget_max
-- - acceptance stays atomic, declines every CREATED offer on the listing,
--   and posts the decline messages on each offer's own thread

alter table public.offers
  add column if not exists buy_mission_id uuid references public.watchlists(watchlist_id) on delete set null;

create index if not exists offers_buy_mission_id_idx
  on public.offers (buy_mission_id)
  where buy_mission_id is not null;

create or replace function public.counter_offer_v0(
  p_previous_offer_id uuid,
  p_amount int,
  p_currency char(3),
  p_expires_at timestamptz,
  p_sender_id uuid
)
returns public.offers
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_previous public.offers%rowtype;
  v_new public.offers%rowtype;
  v_now timestamptz := now();
begin
  if p_previous_offer_id is null then
    raise exception 'previous_offer_id required';
  end if;
  if p_sender_id is null then
    raise exception 'sender_id required';
  end if;

  select * into v_previous
    from public.offers o
   where o.offer_id = p_previous_offer_id
   for update;

  if not found then
    raise exception 'offer not found';
  end if;

  if p_sender_id is distinct from v_previous.buyer_agent_id
     and p_sender_id is distinct from v_previous.seller_agent_id then
    raise exception 'offer not found';
  end if;

  if v_previous.status <> 'CREATED' then
    raise exception 'offer not counterable';
  end if;

  if v_previous.expires_at <= v_now then
    raise exception 'OFFER_NOT_COUNTERABLE:EXPIRED';
  end if;

  update public.offers
     set status = 'COUNTERED', updated_at = v_now
   where offer_id = p_previous_offer_id
     and status = 'CREATED';

  if not found then
    raise exception 'offer not counterable';
  end if;

  insert into public.offers (
    thread_id, listing_id, buyer_agent_id, seller_agent_id,
    proposed_by_agent_id, previous_offer_id, buy_mission_id,
    amount, currency, expires_at, status
  )
  values (
    v_previous.thread_id, v_previous.listing_id,
    v_previous.buyer_agent_id, v_previous.seller_agent_id,
    p_sender_id, p_previous_offer_id, v_previous.buy_mission_id,
    p_amount, p_currency, p_expires_at, 'CREATED'
  )
  returning * into v_new;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    v_new.thread_id, p_sender_id, 'agent'::public.message_sender_type, null,
    'counter_offer'::public.message_type,
    jsonb_build_object(
      'type', 'counter_offer',
      'offer_id', v_new.offer_id,
      'previous_offer_id', p_previous_offer_id
    ),
    false
  );

  return v_new;
end;
$$;

create or replace function public.offer_accept_v0(
  p_offer_id uuid,
  p_actor_agent_id uuid
)
returns table (
  offer_id uuid,
  offer_status public.offer_status,
  listing_id uuid,
  listing_status public.listing_status,
  thread_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_id uuid,
  accepted_offer_id uuid,
  tx_status public.transaction_status,
  contact_reveal_state public.contact_reveal_state,
  tx_created_at timestamptz
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  offer_row public.offers%rowtype;
  listing_row public.listings%rowtype;
  tx_row public.transactions%rowtype;
  watchlist_row public.watchlists%rowtype;
  v_now timestamptz := now();
  v_policy_allows_accept boolean := false;
  v_mission jsonb;
  v_mission_expires timestamptz;
  v_hard_budget numeric;
  v_mission_currency text;
begin
  select * into offer_row
    from public.offers o
   where o.offer_id = p_offer_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if p_actor_agent_id is null
     or (
       offer_row.seller_agent_id is distinct from p_actor_agent_id
       and offer_row.buyer_agent_id is distinct from p_actor_agent_id
     ) then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'CREATED' then
    raise exception 'OFFER_NOT_ACTIONABLE:%', offer_row.status;
  end if;

  if offer_row.expires_at <= v_now then
    raise exception 'OFFER_NOT_ACTIONABLE:EXPIRED';
  end if;

  if offer_row.proposed_by_agent_id is null
     or offer_row.proposed_by_agent_id = p_actor_agent_id then
    raise exception 'OFFER_NOT_ACTIONABLE:SELF_PROPOSED';
  end if;

  select * into listing_row
    from public.listings l
   where l.listing_id = offer_row.listing_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if listing_row.status <> 'LIVE' then
    raise exception 'LISTING_LOCKED';
  end if;

  if p_actor_agent_id = offer_row.seller_agent_id then
    select exists (
      select 1
        from public.policies p
       where p.owner_id::text = listing_row.owner_id
         and coalesce(p.policy_json->'auto_approve'->'actions', '[]'::jsonb) ? 'offer.accept'
    ) into v_policy_allows_accept;

    if not v_policy_allows_accept then
      raise exception 'OFFER_POLICY_REQUIRED';
    end if;
  else
    if offer_row.buy_mission_id is null then
      raise exception 'MISSION_APPROVAL_REQUIRED';
    end if;

    select * into watchlist_row
      from public.watchlists w
     where w.watchlist_id = offer_row.buy_mission_id
     for update;

    if not found
       or watchlist_row.agent_id is distinct from offer_row.buyer_agent_id
       or watchlist_row.active is not true
       or watchlist_row.deleted_at is not null then
      raise exception 'MISSION_APPROVAL_REQUIRED';
    end if;

    begin
      v_mission := watchlist_row.criteria->'mission';
      v_mission_expires := nullif(v_mission->>'expires_at', '')::timestamptz;
      v_hard_budget := nullif(v_mission->>'hard_budget_max', '')::numeric;
      v_mission_currency := upper(nullif(v_mission->>'currency', ''));
    exception when others then
      raise exception 'MISSION_APPROVAL_REQUIRED';
    end;

    if v_mission is null
       or jsonb_typeof(v_mission) <> 'object'
       or upper(coalesce(v_mission->>'kind', '')) <> 'BUY'
       or v_mission_expires is null
       or v_mission_expires <= v_now
       or v_hard_budget is null
       or offer_row.amount::numeric > v_hard_budget
       or v_mission_currency is null
       or v_mission_currency is distinct from offer_row.currency
       or upper(watchlist_row.currency) is distinct from offer_row.currency
       or not coalesce(v_mission->'autonomous_actions', '[]'::jsonb) ? 'make_offer' then
      raise exception 'MISSION_APPROVAL_REQUIRED';
    end if;
  end if;

  update public.offers o
     set status = 'ACCEPTED', updated_at = v_now
   where o.offer_id = offer_row.offer_id
   returning * into offer_row;

  begin
    insert into public.transactions (
      listing_id, thread_id, accepted_offer_id, buyer_agent_id, seller_agent_id,
      status, contact_reveal_state, created_at, updated_at
    ) values (
      offer_row.listing_id, offer_row.thread_id, offer_row.offer_id,
      offer_row.buyer_agent_id, offer_row.seller_agent_id,
      'ACCEPTED', 'NOT_REQUESTED', v_now, v_now
    ) returning * into tx_row;
  exception when unique_violation then
    raise exception 'LISTING_LOCKED';
  end;

  update public.listings l
     set status = 'RESERVED', reserved_at = v_now, updated_at = v_now
   where l.listing_id = listing_row.listing_id
   returning * into listing_row;

  with declined as (
    update public.offers o
       set status = 'DECLINED', updated_at = v_now
     where o.listing_id = offer_row.listing_id
       and o.offer_id <> offer_row.offer_id
       and o.status = 'CREATED'
     returning o.offer_id, o.thread_id
  )
  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  select d.thread_id,
         '00000000-0000-0000-0000-000000000000',
         'system'::public.message_sender_type,
         null,
         'decline'::public.message_type,
         jsonb_build_object('type', 'decline', 'offer_id', d.offer_id),
         false
    from declined d;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    offer_row.thread_id, p_actor_agent_id,
    'agent'::public.message_sender_type, null, 'accept'::public.message_type,
    jsonb_build_object('type', 'accept', 'offer_id', offer_row.offer_id), false
  );

  return query
    select offer_row.offer_id, offer_row.status,
           listing_row.listing_id, listing_row.status,
           offer_row.thread_id, offer_row.buyer_agent_id, offer_row.seller_agent_id,
           tx_row.tx_id, tx_row.accepted_offer_id, tx_row.status,
           tx_row.contact_reveal_state, tx_row.created_at;
end;
$$;
