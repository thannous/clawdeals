-- TI-201: Offer actions v0 (accept/decline/cancel) + expiration batch
--
-- Implements DB-side atomic operations for Phase 3 negotiation flows.
-- Errors are raised as stable codes in the exception message:
-- - OFFER_NOT_FOUND (anti-enum also used for permission denied)
-- - OFFER_NOT_ACTIONABLE:<STATUS|EXPIRED>
-- - LISTING_LOCKED

create extension if not exists "pgcrypto";

-- Accept offer: seller-only, offer must be CREATED, listing must be LIVE.
create or replace function public.offer_accept_v0(
  p_offer_id uuid,
  p_actor_agent_id uuid
)
returns table (
  offer_id uuid,
  offer_status offer_status,
  listing_id uuid,
  listing_status listing_status,
  thread_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_id uuid,
  accepted_offer_id uuid,
  tx_status transaction_status,
  contact_reveal_state contact_reveal_state,
  tx_created_at timestamptz
)
language plpgsql
as $$
declare
  offer_row public.offers%rowtype;
  listing_row public.listings%rowtype;
  tx_row public.transactions%rowtype;
  v_now timestamptz := now();
begin
  select *
    into offer_row
    from public.offers o
   where o.offer_id = p_offer_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or offer_row.seller_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration: pretend it doesn't exist.
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'CREATED' then
    raise exception 'OFFER_NOT_ACTIONABLE:%', offer_row.status;
  end if;

  if offer_row.expires_at <= v_now then
    raise exception 'OFFER_NOT_ACTIONABLE:EXPIRED';
  end if;

  select *
    into listing_row
    from public.listings l
   where l.listing_id = offer_row.listing_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if listing_row.status <> 'LIVE' then
    raise exception 'LISTING_LOCKED';
  end if;

  update public.offers o
     set status = 'ACCEPTED',
         updated_at = v_now
   where o.offer_id = offer_row.offer_id
   returning * into offer_row;

  begin
    insert into public.transactions (
      listing_id,
      thread_id,
      accepted_offer_id,
      buyer_agent_id,
      seller_agent_id,
      status,
      contact_reveal_state,
      created_at,
      updated_at
    )
    values (
      offer_row.listing_id,
      offer_row.thread_id,
      offer_row.offer_id,
      offer_row.buyer_agent_id,
      offer_row.seller_agent_id,
      'ACCEPTED',
      'NOT_REQUESTED',
      v_now,
      v_now
    )
    returning * into tx_row;
  exception when unique_violation then
    -- Another active transaction exists for this listing.
    raise exception 'LISTING_LOCKED';
  end;

  update public.listings l
     set status = 'RESERVED',
         reserved_at = v_now,
         updated_at = v_now
   where l.listing_id = listing_row.listing_id
   returning * into listing_row;

  -- v0 option: auto-decline any other open offers in the same thread (defensive).
  with declined as (
    update public.offers o
       set status = 'DECLINED',
           updated_at = v_now
     where o.thread_id = offer_row.thread_id
       and o.offer_id <> offer_row.offer_id
       and o.status = 'CREATED'
     returning o.offer_id
  )
  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  select
    offer_row.thread_id,
    '00000000-0000-0000-0000-000000000000',
    'system'::message_sender_type,
    null,
    'decline'::message_type,
    jsonb_build_object('type', 'decline', 'offer_id', d.offer_id),
    false
  from declined d;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    offer_row.thread_id,
    offer_row.seller_agent_id,
    'agent'::message_sender_type,
    null,
    'accept'::message_type,
    jsonb_build_object('type', 'accept', 'offer_id', offer_row.offer_id),
    false
  );

  return query
    select offer_row.offer_id,
           offer_row.status,
           listing_row.listing_id,
           listing_row.status,
           offer_row.thread_id,
           offer_row.buyer_agent_id,
           offer_row.seller_agent_id,
           tx_row.tx_id,
           tx_row.accepted_offer_id,
           tx_row.status,
           tx_row.contact_reveal_state,
           tx_row.created_at;
end;
$$;

-- Decline offer: seller-only, offer must be CREATED.
create or replace function public.offer_decline_v0(
  p_offer_id uuid,
  p_actor_agent_id uuid
)
returns table (
  offer_id uuid,
  offer_status offer_status,
  updated_at timestamptz,
  thread_id uuid,
  listing_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid
)
language plpgsql
as $$
declare
  offer_row public.offers%rowtype;
  v_now timestamptz := now();
begin
  select *
    into offer_row
    from public.offers o
   where o.offer_id = p_offer_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or offer_row.seller_agent_id is distinct from p_actor_agent_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'CREATED' then
    raise exception 'OFFER_NOT_ACTIONABLE:%', offer_row.status;
  end if;

  update public.offers o
     set status = 'DECLINED',
         updated_at = v_now
   where o.offer_id = offer_row.offer_id
   returning * into offer_row;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    offer_row.thread_id,
    offer_row.seller_agent_id,
    'agent'::message_sender_type,
    null,
    'decline'::message_type,
    jsonb_build_object('type', 'decline', 'offer_id', offer_row.offer_id),
    false
  );

  return query
    select offer_row.offer_id,
           offer_row.status,
           offer_row.updated_at,
           offer_row.thread_id,
           offer_row.listing_id,
           offer_row.buyer_agent_id,
           offer_row.seller_agent_id;
end;
$$;

-- Cancel offer: buyer-only, offer must be CREATED.
create or replace function public.offer_cancel_v0(
  p_offer_id uuid,
  p_actor_agent_id uuid
)
returns table (
  offer_id uuid,
  offer_status offer_status,
  updated_at timestamptz,
  thread_id uuid,
  listing_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid
)
language plpgsql
as $$
declare
  offer_row public.offers%rowtype;
  v_now timestamptz := now();
begin
  select *
    into offer_row
    from public.offers o
   where o.offer_id = p_offer_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or offer_row.buyer_agent_id is distinct from p_actor_agent_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'CREATED' then
    raise exception 'OFFER_NOT_ACTIONABLE:%', offer_row.status;
  end if;

  update public.offers o
     set status = 'CANCELLED',
         updated_at = v_now
   where o.offer_id = offer_row.offer_id
   returning * into offer_row;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    offer_row.thread_id,
    offer_row.buyer_agent_id,
    'agent'::message_sender_type,
    null,
    'cancel'::message_type,
    jsonb_build_object('type', 'cancel', 'offer_id', offer_row.offer_id),
    false
  );

  return query
    select offer_row.offer_id,
           offer_row.status,
           offer_row.updated_at,
           offer_row.thread_id,
           offer_row.listing_id,
           offer_row.buyer_agent_id,
           offer_row.seller_agent_id;
end;
$$;

-- Expire offers: system batch job.
create or replace function public.offers_expire_v0(
  p_limit int default 100
)
returns table (
  offer_id uuid,
  offer_status offer_status,
  expires_at timestamptz,
  updated_at timestamptz,
  thread_id uuid,
  listing_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid
)
language plpgsql
as $$
declare
  v_limit int := greatest(coalesce(p_limit, 100), 1);
  v_now timestamptz := now();
begin
  return query
    with candidates as (
      select o.offer_id
        from public.offers o
       where o.status = 'CREATED'
         and o.expires_at <= v_now
       order by o.expires_at asc, o.offer_id asc
       limit v_limit
       for update skip locked
    ),
    updated as (
      update public.offers o
         set status = 'EXPIRED',
             updated_at = v_now
        from candidates c
       where o.offer_id = c.offer_id
       returning o.offer_id,
                 o.thread_id,
                 o.listing_id,
                 o.buyer_agent_id,
                 o.seller_agent_id,
                 o.expires_at,
                 o.status,
                 o.updated_at
    ),
    _messages as (
      insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
      select
        u.thread_id,
        '00000000-0000-0000-0000-000000000000',
        'system'::message_sender_type,
        'Offer expired',
        'info'::message_type,
        jsonb_build_object('type', 'info', 'text', 'Offer expired'),
        false
      from updated u
      returning 1
    )
    select u.offer_id,
           u.status,
           u.expires_at,
           u.updated_at,
           u.thread_id,
           u.listing_id,
           u.buyer_agent_id,
           u.seller_agent_id
      from updated u
     order by u.expires_at asc, u.offer_id asc;
end;
$$;
