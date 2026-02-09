-- TI-213/TI-212: Ledger writes + refund webhook RPC
--
-- Writes minimal ledger entries on HOLD/RELEASED/REFUNDED and adds a
-- refund webhook transition helper.
--
-- NOTE: Our v0 RPC helpers use `RETURN QUERY` in early/idempotent branches.
-- In PL/pgSQL, `RETURN QUERY` does not exit the function, so we must add
-- an explicit `RETURN;` to avoid continuing into invalid-state checks.

create extension if not exists "pgcrypto";

create or replace function public.escrow_mark_hold_v0(
  p_psp_payment_id text,
  p_psp_hold_id text,
  p_hold_expires_at timestamptz
)
returns table (
  escrow_id uuid,
  tx_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  currency text,
  amount_gross_minor bigint,
  platform_fee_bps int,
  amount_platform_fee_minor bigint,
  amount_net_minor bigint,
  status escrow_status,
  psp_provider text,
  psp_payment_id text,
  psp_hold_id text,
  psp_payout_id text,
  psp_refund_id text,
  hold_expires_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
declare
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
begin
  select *
    into escrow_row
    from public.escrows e
   where e.psp_payment_id = p_psp_payment_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status = 'CREATED' then
    update public.escrows e
       set status = 'HOLD',
           psp_hold_id = coalesce(nullif(btrim(p_psp_hold_id), ''), e.psp_hold_id),
           hold_expires_at = coalesce(p_hold_expires_at, e.hold_expires_at),
           updated_at = v_now
     where e.escrow_id = escrow_row.escrow_id
     returning * into escrow_row;
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED', 'CANCELLED', 'FAILED') then
    -- Ignore late payment webhooks once finalized (idempotent from PSP PoV).
    return query
      select escrow_row.escrow_id,
             escrow_row.tx_id,
             escrow_row.buyer_agent_id,
             escrow_row.seller_agent_id,
             escrow_row.currency,
             escrow_row.amount_gross_minor,
             escrow_row.platform_fee_bps,
             escrow_row.amount_platform_fee_minor,
             escrow_row.amount_net_minor,
             escrow_row.status,
             escrow_row.psp_provider,
             escrow_row.psp_payment_id,
             escrow_row.psp_hold_id,
             escrow_row.psp_payout_id,
             escrow_row.psp_refund_id,
             escrow_row.hold_expires_at,
             escrow_row.delivered_at,
             escrow_row.confirmed_at,
             escrow_row.released_at,
             escrow_row.refunded_at,
             escrow_row.created_at,
             escrow_row.updated_at;
    return;
  end if;

  -- Ledger: write GROSS at HOLD (or idempotent duplicates/out-of-order).
  insert into public.ledger_entries (
    escrow_id,
    type,
    amount_minor,
    currency,
    psp_reference_id
  )
  values (
    escrow_row.escrow_id,
    'GROSS',
    escrow_row.amount_gross_minor,
    escrow_row.currency,
    p_psp_payment_id
  )
  on conflict on constraint ledger_entries_one_per_type_unique do nothing;

  -- If we are past CREATED, treat as idempotent (duplicate/out-of-order).
  return query
    select escrow_row.escrow_id,
           escrow_row.tx_id,
           escrow_row.buyer_agent_id,
           escrow_row.seller_agent_id,
           escrow_row.currency,
           escrow_row.amount_gross_minor,
           escrow_row.platform_fee_bps,
           escrow_row.amount_platform_fee_minor,
           escrow_row.amount_net_minor,
           escrow_row.status,
           escrow_row.psp_provider,
           escrow_row.psp_payment_id,
           escrow_row.psp_hold_id,
           escrow_row.psp_payout_id,
           escrow_row.psp_refund_id,
           escrow_row.hold_expires_at,
           escrow_row.delivered_at,
           escrow_row.confirmed_at,
           escrow_row.released_at,
           escrow_row.refunded_at,
           escrow_row.created_at,
           escrow_row.updated_at;
end;
$$;

create or replace function public.escrow_mark_released_v0(
  p_psp_payout_id text
)
returns table (
  escrow_id uuid,
  tx_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  currency text,
  amount_gross_minor bigint,
  platform_fee_bps int,
  amount_platform_fee_minor bigint,
  amount_net_minor bigint,
  status escrow_status,
  psp_provider text,
  psp_payment_id text,
  psp_hold_id text,
  psp_payout_id text,
  psp_refund_id text,
  hold_expires_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
declare
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
begin
  select *
    into escrow_row
    from public.escrows e
   where e.psp_payout_id = p_psp_payout_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status = 'RELEASED' then
    -- Ledger: ensure RELEASED writes exist (idempotent).
    insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
    values (escrow_row.escrow_id, 'PLATFORM_FEE', escrow_row.amount_platform_fee_minor, escrow_row.currency, p_psp_payout_id)
    on conflict on constraint ledger_entries_one_per_type_unique do nothing;

    insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
    values (escrow_row.escrow_id, 'NET_TO_SELLER', escrow_row.amount_net_minor, escrow_row.currency, p_psp_payout_id)
    on conflict on constraint ledger_entries_one_per_type_unique do nothing;

    return query
      select escrow_row.escrow_id,
             escrow_row.tx_id,
             escrow_row.buyer_agent_id,
             escrow_row.seller_agent_id,
             escrow_row.currency,
             escrow_row.amount_gross_minor,
             escrow_row.platform_fee_bps,
             escrow_row.amount_platform_fee_minor,
             escrow_row.amount_net_minor,
             escrow_row.status,
             escrow_row.psp_provider,
             escrow_row.psp_payment_id,
             escrow_row.psp_hold_id,
             escrow_row.psp_payout_id,
             escrow_row.psp_refund_id,
             escrow_row.hold_expires_at,
             escrow_row.delivered_at,
             escrow_row.confirmed_at,
             escrow_row.released_at,
             escrow_row.refunded_at,
             escrow_row.created_at,
             escrow_row.updated_at;
    return;
  end if;

  if escrow_row.status <> 'RELEASE_PENDING' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  update public.escrows e
     set status = 'RELEASED',
         released_at = coalesce(e.released_at, v_now),
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

  -- Ledger: write PLATFORM_FEE + NET_TO_SELLER at RELEASED.
  insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
  values (escrow_row.escrow_id, 'PLATFORM_FEE', escrow_row.amount_platform_fee_minor, escrow_row.currency, p_psp_payout_id)
  on conflict on constraint ledger_entries_one_per_type_unique do nothing;

  insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
  values (escrow_row.escrow_id, 'NET_TO_SELLER', escrow_row.amount_net_minor, escrow_row.currency, p_psp_payout_id)
  on conflict on constraint ledger_entries_one_per_type_unique do nothing;

  return query
    select escrow_row.escrow_id,
           escrow_row.tx_id,
           escrow_row.buyer_agent_id,
           escrow_row.seller_agent_id,
           escrow_row.currency,
           escrow_row.amount_gross_minor,
           escrow_row.platform_fee_bps,
           escrow_row.amount_platform_fee_minor,
           escrow_row.amount_net_minor,
           escrow_row.status,
           escrow_row.psp_provider,
           escrow_row.psp_payment_id,
           escrow_row.psp_hold_id,
           escrow_row.psp_payout_id,
           escrow_row.psp_refund_id,
           escrow_row.hold_expires_at,
           escrow_row.delivered_at,
           escrow_row.confirmed_at,
           escrow_row.released_at,
           escrow_row.refunded_at,
           escrow_row.created_at,
           escrow_row.updated_at;
end;
$$;

create or replace function public.escrow_mark_refunded_v0(
  p_psp_refund_id text
)
returns table (
  escrow_id uuid,
  tx_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  currency text,
  amount_gross_minor bigint,
  platform_fee_bps int,
  amount_platform_fee_minor bigint,
  amount_net_minor bigint,
  status escrow_status,
  psp_provider text,
  psp_payment_id text,
  psp_hold_id text,
  psp_payout_id text,
  psp_refund_id text,
  hold_expires_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
declare
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
begin
  select *
    into escrow_row
    from public.escrows e
   where e.psp_refund_id = p_psp_refund_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status = 'REFUNDED' then
    -- Ledger: ensure REFUND write exists (idempotent).
    insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
    values (escrow_row.escrow_id, 'REFUND', escrow_row.amount_gross_minor, escrow_row.currency, p_psp_refund_id)
    on conflict on constraint ledger_entries_one_per_type_unique do nothing;

    return query
      select escrow_row.escrow_id,
             escrow_row.tx_id,
             escrow_row.buyer_agent_id,
             escrow_row.seller_agent_id,
             escrow_row.currency,
             escrow_row.amount_gross_minor,
             escrow_row.platform_fee_bps,
             escrow_row.amount_platform_fee_minor,
             escrow_row.amount_net_minor,
             escrow_row.status,
             escrow_row.psp_provider,
             escrow_row.psp_payment_id,
             escrow_row.psp_hold_id,
             escrow_row.psp_payout_id,
             escrow_row.psp_refund_id,
             escrow_row.hold_expires_at,
             escrow_row.delivered_at,
             escrow_row.confirmed_at,
             escrow_row.released_at,
             escrow_row.refunded_at,
             escrow_row.created_at,
             escrow_row.updated_at;
    return;
  end if;

  if escrow_row.status in ('RELEASED', 'CANCELLED', 'FAILED') then
    raise exception 'ESCROW_FINALIZED';
  end if;

  if escrow_row.status <> 'REFUND_PENDING' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  update public.escrows e
     set status = 'REFUNDED',
         refunded_at = coalesce(e.refunded_at, v_now),
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

  -- Ledger: write REFUND at REFUNDED.
  insert into public.ledger_entries (escrow_id, type, amount_minor, currency, psp_reference_id)
  values (escrow_row.escrow_id, 'REFUND', escrow_row.amount_gross_minor, escrow_row.currency, p_psp_refund_id)
  on conflict on constraint ledger_entries_one_per_type_unique do nothing;

  return query
    select escrow_row.escrow_id,
           escrow_row.tx_id,
           escrow_row.buyer_agent_id,
           escrow_row.seller_agent_id,
           escrow_row.currency,
           escrow_row.amount_gross_minor,
           escrow_row.platform_fee_bps,
           escrow_row.amount_platform_fee_minor,
           escrow_row.amount_net_minor,
           escrow_row.status,
           escrow_row.psp_provider,
           escrow_row.psp_payment_id,
           escrow_row.psp_hold_id,
           escrow_row.psp_payout_id,
           escrow_row.psp_refund_id,
           escrow_row.hold_expires_at,
           escrow_row.delivered_at,
           escrow_row.confirmed_at,
           escrow_row.released_at,
           escrow_row.refunded_at,
           escrow_row.created_at,
           escrow_row.updated_at;
end;
$$;
