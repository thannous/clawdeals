-- Security hardening: preserve proposal direction and enforce owner policy/expiry
-- at the atomic offer transition boundary.

alter table public.offers
  add column if not exists proposed_by_agent_id uuid references public.agents(id) on delete restrict;

update public.offers o
   set proposed_by_agent_id = coalesce(
     (
       select m.sender_id
         from public.messages m
        where m.sender_type = 'agent'::public.message_sender_type
          and m.type in ('offer'::public.message_type, 'counter_offer'::public.message_type)
          and m.payload->>'offer_id' = o.offer_id::text
        order by m.created_at asc, m.message_id asc
        limit 1
     ),
     case
       when o.previous_offer_id is null then o.buyer_agent_id
       else o.seller_agent_id
     end
   )
 where o.proposed_by_agent_id is null;

create or replace function public.set_offer_proposer_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.proposed_by_agent_id is null then
    if new.previous_offer_id is null then
      new.proposed_by_agent_id := new.buyer_agent_id;
    else
      raise exception 'OFFER_PROPOSER_REQUIRED';
    end if;
  end if;

  if new.proposed_by_agent_id is distinct from new.buyer_agent_id
     and new.proposed_by_agent_id is distinct from new.seller_agent_id then
    raise exception 'OFFER_PROPOSER_NOT_PARTICIPANT';
  end if;

  return new;
end;
$$;

drop trigger if exists offers_set_proposer_v1 on public.offers;
create trigger offers_set_proposer_v1
before insert or update of proposed_by_agent_id, buyer_agent_id, seller_agent_id, previous_offer_id
on public.offers
for each row execute function public.set_offer_proposer_v1();

alter table public.offers
  alter column proposed_by_agent_id set not null;

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
    proposed_by_agent_id, previous_offer_id, amount, currency, expires_at, status
  )
  values (
    v_previous.thread_id, v_previous.listing_id,
    v_previous.buyer_agent_id, v_previous.seller_agent_id,
    p_sender_id, p_previous_offer_id, p_amount, p_currency, p_expires_at, 'CREATED'
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
  v_now timestamptz := now();
  v_policy_allows_accept boolean := false;
begin
  select * into offer_row
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

  select exists (
    select 1
      from public.policies p
     where p.owner_id = listing_row.owner_id
       and coalesce(p.policy_json->'auto_approve'->'actions', '[]'::jsonb) ? 'offer.accept'
  ) into v_policy_allows_accept;

  if not v_policy_allows_accept then
    raise exception 'OFFER_POLICY_REQUIRED';
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
     where o.thread_id = offer_row.thread_id
       and o.offer_id <> offer_row.offer_id
       and o.status = 'CREATED'
     returning o.offer_id
  )
  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  select offer_row.thread_id,
         '00000000-0000-0000-0000-000000000000',
         'system'::public.message_sender_type,
         null,
         'decline'::public.message_type,
         jsonb_build_object('type', 'decline', 'offer_id', d.offer_id),
         false
    from declined d;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    offer_row.thread_id, offer_row.seller_agent_id,
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

revoke execute on function public.set_offer_proposer_v1() from public, anon, authenticated;
