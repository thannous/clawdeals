-- Protected checkout v1.
--
-- 1. The listing and the accepted offer are frozen when the escrow is created
--    (escrow_terms_snapshots), so a dispute is judged against what was sold.
-- 2. Delivery starts an inspection window. A dispute opened inside it pauses
--    payout; one opened after it is rejected; an undisputed escrow is released
--    when the window ends.
-- 3. Carrier tracking is stored as a fact (escrow_shipments,
--    escrow_tracking_events). A delivery event starts the window and never
--    resolves a dispute: a human reviewer decides what the parcel contained.
--
-- Posture: backend-only through service_role; anon and authenticated are denied.

-- Inspection window --------------------------------------------------------

alter table public.escrows
  add column if not exists inspection_window_hours int not null default 48,
  add column if not exists inspection_ends_at timestamptz,
  add column if not exists inspection_expired_at timestamptz;

alter table public.escrows
  drop constraint if exists escrows_inspection_window_hours_check;
alter table public.escrows
  add constraint escrows_inspection_window_hours_check
  check (inspection_window_hours between 1 and 720);

-- Escrows delivered before this migration get a full window from now.
update public.escrows e
   set inspection_ends_at = now() + make_interval(hours => e.inspection_window_hours)
 where e.status = 'DELIVERED'
   and e.inspection_ends_at is null;

alter table public.escrows
  drop constraint if exists escrows_delivered_has_inspection_window_check;
alter table public.escrows
  add constraint escrows_delivered_has_inspection_window_check
  check (status <> 'DELIVERED' or inspection_ends_at is not null);

create index if not exists escrows_inspection_due_idx
  on public.escrows (inspection_ends_at)
  where status = 'DELIVERED';

create index if not exists escrows_inspection_release_retry_idx
  on public.escrows (updated_at)
  where status = 'CONFIRMED' and inspection_expired_at is not null and psp_payout_id is null;

-- Terms snapshot -----------------------------------------------------------

create table if not exists public.escrow_terms_snapshots (
  escrow_id uuid primary key references public.escrows(escrow_id) on delete cascade,
  tx_id uuid not null,
  listing_id uuid not null,
  accepted_offer_id uuid not null,
  terms jsonb not null,
  terms_sha256 text not null,
  captured_at timestamptz not null default now(),
  constraint escrow_terms_snapshots_sha256_len_check check (char_length(terms_sha256) = 64)
);

alter table public.escrow_terms_snapshots enable row level security;
alter table public.escrow_terms_snapshots force row level security;

drop policy if exists deny_all_anon_authenticated on public.escrow_terms_snapshots;
create policy deny_all_anon_authenticated
on public.escrow_terms_snapshots
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.escrow_terms_snapshots from public, anon, authenticated;
-- No update grant: a snapshot is written once. Delete stays for the cascade
-- from a removed escrow and for disposable test-data cleanup.
grant select, insert, delete on public.escrow_terms_snapshots to service_role;

create or replace function public.escrow_terms_snapshot_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  raise exception 'ESCROW_TERMS_SNAPSHOT_IMMUTABLE';
end;
$$;

drop trigger if exists escrow_terms_snapshots_immutable on public.escrow_terms_snapshots;
create trigger escrow_terms_snapshots_immutable
before update on public.escrow_terms_snapshots
for each row execute function public.escrow_terms_snapshot_immutable_v1();

-- Runs in the transaction that inserts the escrow, whichever path creates it
-- (escrow_create_v0 directly or through an approved escrow.create approval).
create or replace function public.escrow_capture_terms_snapshot_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  tx_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
  offer_row public.offers%rowtype;
  v_terms jsonb;
begin
  select * into tx_row from public.transactions t where t.tx_id = new.tx_id;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  select * into listing_row from public.listings l where l.listing_id = tx_row.listing_id;
  select * into offer_row from public.offers o where o.offer_id = tx_row.accepted_offer_id;
  if listing_row.listing_id is null or offer_row.offer_id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_terms := jsonb_build_object(
    'listing', jsonb_build_object(
      'listing_id', listing_row.listing_id,
      'title', listing_row.title,
      'description', listing_row.description,
      'category', listing_row.category,
      'condition', listing_row.condition,
      'price_amount', listing_row.price_amount,
      'currency', btrim(listing_row.currency::text),
      'delivery_method', listing_row.delivery_method,
      'market_code', listing_row.market_code,
      'photos', coalesce(listing_row.photos, '[]'::jsonb),
      'cover_image_index', listing_row.cover_image_index,
      'updated_at', listing_row.updated_at
    ),
    'offer', jsonb_build_object(
      'offer_id', offer_row.offer_id,
      'amount', offer_row.amount,
      'currency', btrim(offer_row.currency::text),
      'proposed_by_agent_id', offer_row.proposed_by_agent_id,
      'created_at', offer_row.created_at
    ),
    'payment', jsonb_build_object(
      'amount_gross_minor', new.amount_gross_minor,
      'amount_platform_fee_minor', new.amount_platform_fee_minor,
      'amount_net_minor', new.amount_net_minor,
      'currency', new.currency
    ),
    'inspection_window_hours', new.inspection_window_hours
  );

  insert into public.escrow_terms_snapshots (
    escrow_id, tx_id, listing_id, accepted_offer_id, terms, terms_sha256, captured_at
  )
  values (
    new.escrow_id,
    tx_row.tx_id,
    listing_row.listing_id,
    offer_row.offer_id,
    v_terms,
    encode(digest(v_terms::text, 'sha256'), 'hex'),
    new.created_at
  );

  return new;
end;
$$;

revoke all on function public.escrow_terms_snapshot_immutable_v1() from public, anon, authenticated;
revoke all on function public.escrow_capture_terms_snapshot_v1() from public, anon, authenticated;
grant execute on function public.escrow_terms_snapshot_immutable_v1() to service_role;
grant execute on function public.escrow_capture_terms_snapshot_v1() to service_role;

drop trigger if exists escrows_capture_terms_snapshot on public.escrows;
create trigger escrows_capture_terms_snapshot
after insert on public.escrows
for each row execute function public.escrow_capture_terms_snapshot_v1();

-- Shipments and carrier events --------------------------------------------

create table if not exists public.escrow_shipments (
  shipment_id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references public.escrows(escrow_id) on delete cascade,
  tracking_provider text not null default 'mock',
  carrier text not null,
  tracking_number text not null,
  status text not null default 'REGISTERED',
  carrier_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escrow_shipments_one_per_escrow_unique unique (escrow_id),
  constraint escrow_shipments_tracking_unique unique (carrier, tracking_number),
  constraint escrow_shipments_tracking_provider_check check (tracking_provider in ('mock')),
  constraint escrow_shipments_carrier_check check (carrier ~ '^[a-z0-9_]{2,32}$'),
  constraint escrow_shipments_tracking_number_check check (tracking_number ~ '^[A-Z0-9]{6,40}$'),
  constraint escrow_shipments_status_check check (status in ('REGISTERED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION'))
);

create table if not exists public.escrow_tracking_events (
  tracking_event_id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.escrow_shipments(shipment_id) on delete cascade,
  provider_event_id text not null,
  status text not null,
  occurred_at timestamptz not null,
  location text,
  received_at timestamptz not null default now(),
  constraint escrow_tracking_events_provider_event_unique unique (shipment_id, provider_event_id),
  constraint escrow_tracking_events_status_check check (status in ('IN_TRANSIT', 'DELIVERED', 'EXCEPTION')),
  constraint escrow_tracking_events_location_len_check check (location is null or char_length(location) <= 120)
);

create index if not exists escrow_tracking_events_shipment_occurred_idx
  on public.escrow_tracking_events (shipment_id, occurred_at desc);

alter table public.escrow_shipments enable row level security;
alter table public.escrow_shipments force row level security;
alter table public.escrow_tracking_events enable row level security;
alter table public.escrow_tracking_events force row level security;

drop policy if exists deny_all_anon_authenticated on public.escrow_shipments;
create policy deny_all_anon_authenticated
on public.escrow_shipments
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.escrow_tracking_events;
create policy deny_all_anon_authenticated
on public.escrow_tracking_events
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.escrow_shipments from public, anon, authenticated;
revoke all on public.escrow_tracking_events from public, anon, authenticated;
grant select, insert, update, delete on public.escrow_shipments to service_role;
grant select, insert, delete on public.escrow_tracking_events to service_role;

create or replace function public.escrow_register_shipment_v1(
  p_escrow_id uuid,
  p_actor_agent_id uuid,
  p_carrier text,
  p_tracking_number text
)
returns table (
  shipment_id uuid,
  escrow_id uuid,
  tracking_provider text,
  carrier text,
  tracking_number text,
  status text,
  carrier_delivered_at timestamptz,
  created_at timestamptz,
  escrow_status escrow_status
)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  escrow_row public.escrows%rowtype;
  shipment_row public.escrow_shipments%rowtype;
  v_carrier text := lower(btrim(coalesce(p_carrier, '')));
  v_tracking text := upper(regexp_replace(coalesce(p_tracking_number, ''), '[\s-]', '', 'g'));
begin
  select * into escrow_row
    from public.escrows e
   where e.escrow_id = p_escrow_id
   for update;

  if not found
     or p_actor_agent_id is null
     or escrow_row.seller_agent_id is distinct from p_actor_agent_id then
    -- Anti-enumeration.
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if v_carrier !~ '^[a-z0-9_]{2,32}$' then
    raise exception 'VALIDATION_ERROR:CARRIER';
  end if;
  if v_tracking !~ '^[A-Z0-9]{6,40}$' then
    raise exception 'VALIDATION_ERROR:TRACKING_NUMBER';
  end if;

  select * into shipment_row
    from public.escrow_shipments s
   where s.escrow_id = escrow_row.escrow_id;

  if found then
    if shipment_row.carrier is distinct from v_carrier
       or shipment_row.tracking_number is distinct from v_tracking then
      raise exception 'SHIPMENT_ALREADY_REGISTERED';
    end if;
  else
    if escrow_row.status <> 'HOLD' then
      raise exception 'INVALID_STATE:%', escrow_row.status;
    end if;

    begin
      insert into public.escrow_shipments (escrow_id, carrier, tracking_number)
      values (escrow_row.escrow_id, v_carrier, v_tracking)
      returning * into shipment_row;
    exception when unique_violation then
      raise exception 'TRACKING_NUMBER_IN_USE';
    end;
  end if;

  return query
    select shipment_row.shipment_id,
           shipment_row.escrow_id,
           shipment_row.tracking_provider,
           shipment_row.carrier,
           shipment_row.tracking_number,
           shipment_row.status,
           shipment_row.carrier_delivered_at,
           shipment_row.created_at,
           escrow_row.status;
end;
$$;

-- A carrier event is a fact about the parcel. A DELIVERED event moves a held
-- escrow to DELIVERED and starts the inspection window from the moment the
-- event is received, so a late event cannot arrive with the window already
-- spent. It never changes a dispute or releases funds.
create or replace function public.escrow_record_tracking_event_v1(
  p_carrier text,
  p_tracking_number text,
  p_provider_event_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_location text
)
returns table (
  shipment_id uuid,
  escrow_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  shipment_status text,
  escrow_status escrow_status,
  inspection_ends_at timestamptz,
  duplicate boolean,
  window_started boolean
)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  escrow_row public.escrows%rowtype;
  shipment_row public.escrow_shipments%rowtype;
  v_now timestamptz := now();
  v_carrier text := lower(btrim(coalesce(p_carrier, '')));
  v_tracking text := upper(regexp_replace(coalesce(p_tracking_number, ''), '[\s-]', '', 'g'));
  v_event_id text := nullif(btrim(coalesce(p_provider_event_id, '')), '');
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_inserted int;
  v_duplicate boolean := false;
  v_window_started boolean := false;
begin
  if v_event_id is null or char_length(v_event_id) > 128 then
    raise exception 'VALIDATION_ERROR:EVENT_ID';
  end if;
  if v_status not in ('IN_TRANSIT', 'DELIVERED', 'EXCEPTION') then
    raise exception 'VALIDATION_ERROR:STATUS';
  end if;
  if p_occurred_at is null then
    raise exception 'VALIDATION_ERROR:OCCURRED_AT';
  end if;

  select s.escrow_id into shipment_row.escrow_id
    from public.escrow_shipments s
   where s.carrier = v_carrier
     and s.tracking_number = v_tracking;
  if not found then
    raise exception 'SHIPMENT_NOT_FOUND';
  end if;

  -- Lock order: escrow, then shipment (same as every other escrow transition).
  select * into escrow_row
    from public.escrows e
   where e.escrow_id = shipment_row.escrow_id
   for update;

  select * into shipment_row
    from public.escrow_shipments s
   where s.escrow_id = escrow_row.escrow_id
   for update;

  insert into public.escrow_tracking_events (shipment_id, provider_event_id, status, occurred_at, location)
  values (
    shipment_row.shipment_id,
    v_event_id,
    v_status,
    p_occurred_at,
    nullif(left(btrim(coalesce(p_location, '')), 120), '')
  )
  on conflict on constraint escrow_tracking_events_provider_event_unique do nothing;
  get diagnostics v_inserted = row_count;
  v_duplicate := v_inserted = 0;

  if not v_duplicate and shipment_row.status <> 'DELIVERED' then
    update public.escrow_shipments s
       set status = v_status,
           carrier_delivered_at = case when v_status = 'DELIVERED' then p_occurred_at else s.carrier_delivered_at end,
           updated_at = v_now
     where s.shipment_id = shipment_row.shipment_id
     returning * into shipment_row;

    if v_status = 'DELIVERED' and escrow_row.status = 'HOLD' then
      update public.escrows e
         set status = 'DELIVERED',
             delivered_at = coalesce(e.delivered_at, v_now),
             inspection_ends_at = v_now + make_interval(hours => e.inspection_window_hours),
             updated_at = v_now
       where e.escrow_id = escrow_row.escrow_id
       returning * into escrow_row;
      v_window_started := true;
    end if;
  end if;

  return query
    select shipment_row.shipment_id,
           escrow_row.escrow_id,
           escrow_row.buyer_agent_id,
           escrow_row.seller_agent_id,
           shipment_row.status,
           escrow_row.status,
           escrow_row.inspection_ends_at,
           v_duplicate,
           v_window_started;
end;
$$;

-- Seller hand-over. With a registered shipment the carrier decides delivery,
-- so the seller cannot start the buyer's inspection clock on their own word.
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
set search_path = pg_catalog, public, extensions
as $$
declare
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
begin
  select * into escrow_row
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

  if escrow_row.status <> 'DELIVERED' then
    if escrow_row.status <> 'HOLD' then
      raise exception 'INVALID_STATE:%', escrow_row.status;
    end if;

    if exists (select 1 from public.escrow_shipments s where s.escrow_id = escrow_row.escrow_id) then
      raise exception 'SHIPMENT_TRACKED';
    end if;

    update public.escrows e
       set status = 'DELIVERED',
           delivered_at = coalesce(e.delivered_at, v_now),
           inspection_ends_at = v_now + make_interval(hours => e.inspection_window_hours),
           updated_at = v_now
     where e.escrow_id = escrow_row.escrow_id
     returning * into escrow_row;
  end if;

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

-- Same contract as before, plus the deadline: once delivered, a dispute must
-- be opened before the inspection window ends.
create or replace function public.dispute_open_v0(
  p_escrow_id uuid,
  p_actor_agent_id uuid,
  p_reason_code text,
  p_opened_notes_redacted text
)
returns table (
  dispute_id uuid,
  escrow_id uuid,
  status dispute_status,
  opened_by dispute_opened_by,
  reason_code text,
  opened_at timestamptz,
  escrow_status escrow_status
)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  escrow_row public.escrows%rowtype;
  dispute_row public.disputes%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_opened_notes text;
  v_opened_by dispute_opened_by;
begin
  select * into escrow_row
    from public.escrows e
   where e.escrow_id = p_escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  if p_actor_agent_id is null or (
    escrow_row.buyer_agent_id is distinct from p_actor_agent_id and
    escrow_row.seller_agent_id is distinct from p_actor_agent_id
  ) then
    -- Anti-enumeration: pretend it doesn't exist.
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  select * into dispute_row
    from public.disputes d
   where d.escrow_id = escrow_row.escrow_id;

  if found then
    raise exception 'DISPUTE_ALREADY_EXISTS';
  end if;

  if escrow_row.status not in ('HOLD', 'DELIVERED') then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  if escrow_row.status = 'DELIVERED' and escrow_row.inspection_ends_at <= v_now then
    raise exception 'INSPECTION_WINDOW_CLOSED';
  end if;

  v_reason := lower(coalesce(nullif(btrim(p_reason_code), ''), 'other'));
  if v_reason not in ('item_not_received', 'not_as_described', 'fraud_suspected', 'other') then
    raise exception 'VALIDATION_ERROR:REASON_CODE';
  end if;

  v_opened_notes := nullif(left(coalesce(p_opened_notes_redacted, ''), 500), '');
  v_opened_by :=
    case
      when escrow_row.buyer_agent_id = p_actor_agent_id then 'BUYER'::dispute_opened_by
      else 'SELLER'::dispute_opened_by
    end;

  begin
    insert into public.disputes (
      escrow_id, opened_by, reason_code, status, resolution,
      opened_notes_redacted, opened_at, created_at, updated_at
    )
    values (
      escrow_row.escrow_id, v_opened_by, v_reason, 'OPEN', 'NONE_YET',
      v_opened_notes, v_now, v_now, v_now
    )
    returning * into dispute_row;
  exception when unique_violation then
    raise exception 'DISPUTE_ALREADY_EXISTS';
  end;

  update public.escrows e
     set status = 'DISPUTE_OPEN',
         updated_at = v_now
   where e.escrow_id = escrow_row.escrow_id
   returning * into escrow_row;

  insert into public.evidence_packs (dispute_id)
  values (dispute_row.dispute_id)
  on conflict on constraint evidence_packs_dispute_unique do nothing;

  return query
    select dispute_row.dispute_id,
           dispute_row.escrow_id,
           dispute_row.status,
           dispute_row.opened_by,
           dispute_row.reason_code,
           dispute_row.opened_at,
           escrow_row.status;
end;
$$;

-- Claims escrows whose inspection window ended without a dispute and moves
-- them to CONFIRMED, so the caller can ask the payment provider for the
-- payout. Also returns escrows a previous run confirmed but could not pay out.
-- SKIP LOCKED keeps two runs, and a dispute being opened, from colliding.
create or replace function public.escrow_claim_inspection_expired_v1(
  p_limit int default 50
)
returns table (
  escrow_id uuid,
  tx_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  currency text,
  amount_gross_minor bigint,
  psp_payment_id text,
  inspection_ends_at timestamptz,
  inspection_expired_at timestamptz
)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
begin
  return query
    with due as (
      select e.escrow_id
        from public.escrows e
       where (
               e.status = 'DELIVERED'
               and e.inspection_ends_at <= v_now
             )
          or (
               e.status = 'CONFIRMED'
               and e.inspection_expired_at is not null
               and e.psp_payout_id is null
               and e.updated_at <= v_now - interval '5 minutes'
             )
       order by e.inspection_ends_at
       limit v_limit
       for update skip locked
    )
    update public.escrows e
       set status = 'CONFIRMED',
           confirmed_at = coalesce(e.confirmed_at, v_now),
           inspection_expired_at = coalesce(e.inspection_expired_at, v_now),
           updated_at = v_now
      from due
     where e.escrow_id = due.escrow_id
    returning e.escrow_id,
              e.tx_id,
              e.buyer_agent_id,
              e.seller_agent_id,
              e.currency,
              e.amount_gross_minor,
              e.psp_payment_id,
              e.inspection_ends_at,
              e.inspection_expired_at;
end;
$$;

revoke all on function public.escrow_register_shipment_v1(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.escrow_record_tracking_event_v1(text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.escrow_claim_inspection_expired_v1(int) from public, anon, authenticated;
grant execute on function public.escrow_register_shipment_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.escrow_record_tracking_event_v1(text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.escrow_claim_inspection_expired_v1(int) to service_role;

-- Party statements ---------------------------------------------------------
-- Each party tells the reviewer its side once the dispute is open. One
-- statement per party, editable until the dispute is resolved.

create table if not exists public.dispute_statements (
  dispute_id uuid not null references public.disputes(dispute_id) on delete cascade,
  submitted_by text not null,
  body_redacted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dispute_id, submitted_by),
  constraint dispute_statements_submitted_by_check check (submitted_by in ('BUYER', 'SELLER')),
  constraint dispute_statements_body_len_check check (char_length(body_redacted) between 1 and 2000)
);

alter table public.dispute_statements enable row level security;
alter table public.dispute_statements force row level security;

drop policy if exists deny_all_anon_authenticated on public.dispute_statements;
create policy deny_all_anon_authenticated
on public.dispute_statements
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.dispute_statements from public, anon, authenticated;
grant select, insert, update, delete on public.dispute_statements to service_role;

create or replace function public.dispute_submit_statement_v1(
  p_dispute_id uuid,
  p_submitted_by text,
  p_body_redacted text
)
returns table (
  dispute_id uuid,
  submitted_by text,
  body_redacted text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  dispute_row public.disputes%rowtype;
  statement_row public.dispute_statements%rowtype;
  v_now timestamptz := now();
  v_by text := upper(btrim(coalesce(p_submitted_by, '')));
  v_body text := btrim(coalesce(p_body_redacted, ''));
begin
  if v_by not in ('BUYER', 'SELLER') then
    raise exception 'VALIDATION_ERROR:SUBMITTED_BY';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'VALIDATION_ERROR:BODY';
  end if;

  select * into dispute_row
    from public.disputes d
   where d.dispute_id = p_dispute_id
   for update;
  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;
  if dispute_row.status = 'RESOLVED' then
    raise exception 'DISPUTE_ALREADY_RESOLVED';
  end if;

  insert into public.dispute_statements as s (dispute_id, submitted_by, body_redacted, created_at, updated_at)
  values (dispute_row.dispute_id, v_by, v_body, v_now, v_now)
  on conflict on constraint dispute_statements_pkey do update
    set body_redacted = excluded.body_redacted,
        updated_at = excluded.updated_at
  returning s.* into statement_row;

  return query
    select statement_row.dispute_id,
           statement_row.submitted_by,
           statement_row.body_redacted,
           statement_row.created_at,
           statement_row.updated_at;
end;
$$;

revoke all on function public.dispute_submit_statement_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.dispute_submit_statement_v1(uuid, text, text) to service_role;
