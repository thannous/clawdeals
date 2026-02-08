-- TI-204: Completion workflow v0 (double opt-in + auto-close)
--
-- Adds:
-- - transaction_mark_completed_v0(): atomic double opt-in completion
-- - transactions_auto_complete_stale_v0(): batch job helper (auto-close)

create or replace function public.transaction_mark_completed_v0(
  p_tx_id uuid,
  p_actor_agent_id uuid
)
returns table (
  tx_id uuid,
  listing_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_status transaction_status,
  buyer_completed_at timestamptz,
  seller_completed_at timestamptz,
  auto_completed boolean,
  listing_status listing_status
)
language plpgsql
as $$
declare
  tx_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
  v_now timestamptz := now();
  v_is_buyer boolean;
  v_is_seller boolean;
  v_next_buyer_completed_at timestamptz;
  v_next_seller_completed_at timestamptz;
  v_next_status transaction_status;
begin
  select *
    into tx_row
    from public.transactions t
   where t.tx_id = p_tx_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  if p_actor_agent_id is null
     or (tx_row.buyer_agent_id is distinct from p_actor_agent_id and tx_row.seller_agent_id is distinct from p_actor_agent_id) then
    -- Anti-enumeration: pretend it doesn't exist.
    raise exception 'TX_NOT_FOUND';
  end if;

  -- Idempotent: already completed.
  if tx_row.status = 'COMPLETED' then
    select *
      into listing_row
      from public.listings l
     where l.listing_id = tx_row.listing_id;

    if not found then
      raise exception 'TX_NOT_FOUND';
    end if;

    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.buyer_completed_at,
             tx_row.seller_completed_at,
             tx_row.auto_completed,
             listing_row.status;
    return;
  end if;

  -- Safe default: completion is only actionable after CONTACT_REVEALED.
  if tx_row.status <> 'CONTACT_REVEALED' and tx_row.status <> 'COMPLETED_PENDING_CONFIRM' then
    raise exception 'TX_NOT_READY:%', tx_row.status;
  end if;

  select *
    into listing_row
    from public.listings l
   where l.listing_id = tx_row.listing_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_is_buyer := (tx_row.buyer_agent_id is not distinct from p_actor_agent_id);
  v_is_seller := (tx_row.seller_agent_id is not distinct from p_actor_agent_id);

  v_next_buyer_completed_at :=
    case
      when v_is_buyer then coalesce(tx_row.buyer_completed_at, v_now)
      else tx_row.buyer_completed_at
    end;
  v_next_seller_completed_at :=
    case
      when v_is_seller then coalesce(tx_row.seller_completed_at, v_now)
      else tx_row.seller_completed_at
    end;

  v_next_status :=
    case
      when v_next_buyer_completed_at is not null and v_next_seller_completed_at is not null then 'COMPLETED'
      else 'COMPLETED_PENDING_CONFIRM'
    end;

  -- True idempotency: if nothing changes, do not touch updated_at.
  if v_next_buyer_completed_at is not distinct from tx_row.buyer_completed_at
     and v_next_seller_completed_at is not distinct from tx_row.seller_completed_at
     and v_next_status = tx_row.status then
    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.buyer_completed_at,
             tx_row.seller_completed_at,
             tx_row.auto_completed,
             listing_row.status;
    return;
  end if;

  update public.transactions t
     set buyer_completed_at = v_next_buyer_completed_at,
         seller_completed_at = v_next_seller_completed_at,
         status = v_next_status,
         auto_completed = false,
         updated_at = v_now
   where t.tx_id = tx_row.tx_id
   returning * into tx_row;

  if tx_row.status = 'COMPLETED' then
    update public.listings l
       set status = 'COMPLETED',
           completed_at = coalesce(l.completed_at, v_now),
           updated_at = v_now
     where l.listing_id = listing_row.listing_id
     returning * into listing_row;
  end if;

  return query
    select tx_row.tx_id,
           tx_row.listing_id,
           tx_row.buyer_agent_id,
           tx_row.seller_agent_id,
           tx_row.status,
           tx_row.buyer_completed_at,
           tx_row.seller_completed_at,
           tx_row.auto_completed,
           listing_row.status;
end;
$$;

create or replace function public.transactions_auto_complete_stale_v0(
  p_limit int,
  p_threshold_days int
)
returns table (
  tx_id uuid,
  listing_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_status transaction_status,
  buyer_completed_at timestamptz,
  seller_completed_at timestamptz,
  auto_completed boolean,
  listing_status listing_status
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, coalesce(p_limit, 100));
  v_days int := greatest(1, coalesce(p_threshold_days, 7));
begin
  return query
    with target as (
      select t.tx_id
        from public.transactions t
       where t.status = 'COMPLETED_PENDING_CONFIRM'
         and (
           (t.buyer_completed_at is not null and t.buyer_completed_at < v_now - make_interval(days => v_days))
           or (t.seller_completed_at is not null and t.seller_completed_at < v_now - make_interval(days => v_days))
         )
       order by t.updated_at asc
       limit v_limit
       for update skip locked
    ),
    updated as (
      update public.transactions t
         set buyer_completed_at = coalesce(t.buyer_completed_at, v_now),
             seller_completed_at = coalesce(t.seller_completed_at, v_now),
             status = 'COMPLETED',
             auto_completed = true,
             updated_at = v_now
        from target
       where t.tx_id = target.tx_id
         and t.status = 'COMPLETED_PENDING_CONFIRM'
       returning
         t.tx_id,
         t.listing_id,
         t.buyer_agent_id,
         t.seller_agent_id,
         t.status,
         t.buyer_completed_at,
         t.seller_completed_at,
         t.auto_completed
    ),
    listing_updated as (
      update public.listings l
         set status = 'COMPLETED',
             completed_at = coalesce(l.completed_at, v_now),
             updated_at = v_now
        from updated u
       where l.listing_id = u.listing_id
       returning l.listing_id, l.status
    )
    select u.tx_id,
           u.listing_id,
           u.buyer_agent_id,
           u.seller_agent_id,
           u.status as tx_status,
           u.buyer_completed_at,
           u.seller_completed_at,
           u.auto_completed,
           coalesce(lu.status, 'COMPLETED'::listing_status) as listing_status
      from updated u
      left join listing_updated lu on lu.listing_id = u.listing_id;
end;
$$;

