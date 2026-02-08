-- TI-211: Escrow state machine v0 (created -> hold -> delivered -> confirmed -> release_pending -> released)
--
-- Adds the `escrows` table and DB-side atomic transitions via RPC helpers.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'escrow_status') then
    create type escrow_status as enum (
      'CREATED',
      'HOLD',
      'DELIVERED',
      'CONFIRMED',
      'RELEASE_PENDING',
      'RELEASED',
      'DISPUTE_OPEN',
      'REFUND_PENDING',
      'REFUNDED',
      'CANCELLED',
      'FAILED'
    );
  end if;
end $$;

create table if not exists public.escrows (
  escrow_id uuid primary key default gen_random_uuid(),
  tx_id uuid not null references public.transactions(tx_id) on delete cascade,
  buyer_agent_id uuid not null references public.agents(id) on delete restrict,
  seller_agent_id uuid not null references public.agents(id) on delete restrict,
  currency text not null,
  amount_gross_minor bigint not null,
  platform_fee_bps int not null,
  amount_platform_fee_minor bigint not null,
  amount_net_minor bigint not null,
  status escrow_status not null default 'CREATED',
  psp_provider text not null default 'mock',
  psp_payment_id text,
  psp_hold_id text,
  psp_payout_id text,
  psp_refund_id text,
  hold_expires_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escrows_one_per_tx_unique unique (tx_id),
  constraint escrows_amounts_non_negative_check check (
    amount_gross_minor >= 0 and
    amount_platform_fee_minor >= 0 and
    amount_net_minor >= 0
  ),
  constraint escrows_amounts_consistent_check check (
    amount_gross_minor = amount_platform_fee_minor + amount_net_minor
  ),
  constraint escrows_platform_fee_bps_check check (platform_fee_bps >= 0 and platform_fee_bps <= 2000),
  constraint escrows_psp_provider_check check (psp_provider in ('mock'))
);

create unique index if not exists escrows_psp_payment_unique_idx
  on public.escrows (psp_payment_id)
  where psp_payment_id is not null;

create unique index if not exists escrows_psp_payout_unique_idx
  on public.escrows (psp_payout_id)
  where psp_payout_id is not null;

create unique index if not exists escrows_psp_refund_unique_idx
  on public.escrows (psp_refund_id)
  where psp_refund_id is not null;

create index if not exists escrows_seller_created_idx
  on public.escrows (seller_agent_id, created_at desc);

create index if not exists escrows_buyer_created_idx
  on public.escrows (buyer_agent_id, created_at desc);

create index if not exists escrows_status_created_idx
  on public.escrows (status, created_at desc);

alter table public.escrows enable row level security;
alter table public.escrows force row level security;

drop policy if exists deny_all_anon_authenticated on public.escrows;
create policy deny_all_anon_authenticated
on public.escrows
for all
to anon, authenticated
using (false)
with check (false);

-- Add FK from psp_webhook_events -> escrows once escrows exists.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'psp_webhook_events' and column_name = 'escrow_id') then
    if not exists (select 1 from pg_constraint where conname = 'psp_webhook_events_escrow_id_fkey') then
      alter table public.psp_webhook_events
        add constraint psp_webhook_events_escrow_id_fkey
        foreign key (escrow_id) references public.escrows(escrow_id) on delete set null;
    end if;
  end if;
end $$;

-- RPC helpers

create or replace function public.escrow_create_v0(
  p_tx_id uuid,
  p_actor_agent_id uuid,
  p_fee_bps int
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
  tx_row public.transactions%rowtype;
  offer_row public.offers%rowtype;
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
  v_amount bigint;
  v_fee_bps int;
  v_fee_minor bigint;
  v_net_minor bigint;
  v_currency text;
begin
  select *
    into tx_row
    from public.transactions t
   where t.tx_id = p_tx_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or tx_row.buyer_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration: pretend it doesn't exist.
    raise exception 'TX_NOT_FOUND';
  end if;

  if tx_row.status not in ('ACCEPTED', 'CONTACT_REVEALED') then
    raise exception 'TX_NOT_READY:%', tx_row.status;
  end if;

  select *
    into offer_row
    from public.offers o
   where o.offer_id = tx_row.accepted_offer_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_amount := offer_row.amount::bigint;
  v_currency := offer_row.currency::text;

  v_fee_bps := greatest(0, least(coalesce(p_fee_bps, 0), 2000));
  -- round(amount * bps / 10_000) with half-up rounding.
  v_fee_minor := ((v_amount * v_fee_bps)::bigint + 5000) / 10000;
  v_fee_minor := greatest(0, least(v_fee_minor, v_amount));
  v_net_minor := v_amount - v_fee_minor;

  begin
    insert into public.escrows (
      tx_id,
      buyer_agent_id,
      seller_agent_id,
      currency,
      amount_gross_minor,
      platform_fee_bps,
      amount_platform_fee_minor,
      amount_net_minor,
      status,
      psp_provider,
      created_at,
      updated_at
    )
    values (
      tx_row.tx_id,
      tx_row.buyer_agent_id,
      tx_row.seller_agent_id,
      v_currency,
      v_amount,
      v_fee_bps,
      v_fee_minor,
      v_net_minor,
      'CREATED',
      'mock',
      v_now,
      v_now
    )
    returning * into escrow_row;
  exception when unique_violation then
    raise exception 'ESCROW_ALREADY_EXISTS';
  end;

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

create or replace function public.escrow_set_payment_v0(
  p_escrow_id uuid,
  p_actor_agent_id uuid,
  p_psp_provider text,
  p_psp_payment_id text
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
   where e.escrow_id = p_escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or escrow_row.buyer_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration: pretend it doesn't exist.
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED', 'CANCELLED', 'FAILED') then
    raise exception 'ESCROW_FINALIZED';
  end if;

  if escrow_row.status <> 'CREATED' then
    raise exception 'ESCROW_NOT_ACTIONABLE:%', escrow_row.status;
  end if;

  if escrow_row.psp_payment_id is not null then
    if escrow_row.psp_payment_id = p_psp_payment_id then
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
    end if;
    raise exception 'ESCROW_PAYMENT_ALREADY_SET';
  end if;

  update public.escrows e
     set psp_provider = coalesce(nullif(btrim(p_psp_provider), ''), escrow_row.psp_provider),
         psp_payment_id = p_psp_payment_id,
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

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
  end if;

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

create or replace function public.escrow_mark_delivered_v0(
  p_escrow_id uuid,
  p_actor_agent_id uuid
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
   where e.escrow_id = p_escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or escrow_row.seller_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration.
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED') then
    raise exception 'ESCROW_FINALIZED';
  end if;

  if escrow_row.status = 'DELIVERED' then
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
  end if;

  if escrow_row.status <> 'HOLD' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  update public.escrows e
     set status = 'DELIVERED',
         delivered_at = coalesce(e.delivered_at, v_now),
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

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

create or replace function public.escrow_mark_confirmed_v0(
  p_escrow_id uuid,
  p_actor_agent_id uuid
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
   where e.escrow_id = p_escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or escrow_row.buyer_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration.
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED') then
    raise exception 'ESCROW_FINALIZED';
  end if;

  if escrow_row.status in ('CONFIRMED', 'RELEASE_PENDING', 'RELEASED') then
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
  end if;

  if escrow_row.status <> 'DELIVERED' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  update public.escrows e
     set status = 'CONFIRMED',
         confirmed_at = coalesce(e.confirmed_at, v_now),
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

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

create or replace function public.escrow_set_release_pending_v0(
  p_escrow_id uuid,
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
   where e.escrow_id = p_escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if escrow_row.status = 'RELEASE_PENDING' and escrow_row.psp_payout_id = p_psp_payout_id then
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
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED') then
    raise exception 'ESCROW_FINALIZED';
  end if;

  if escrow_row.status <> 'CONFIRMED' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  update public.escrows e
     set status = 'RELEASE_PENDING',
         psp_payout_id = p_psp_payout_id,
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

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

