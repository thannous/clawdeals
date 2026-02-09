-- TI-212: Disputes v0 (refund/dispute) - DB-side helpers
--
-- Adds dispute RPC helpers that atomically update escrow/dispute state.
-- v0 posture: called from backend using service role; direct PostgREST access is denied.

create extension if not exists "pgcrypto";

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
as $$
declare
  escrow_row public.escrows%rowtype;
  dispute_row public.disputes%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_opened_notes text;
  v_opened_by dispute_opened_by;
begin
  select *
    into escrow_row
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

  -- Explicit 409 when a dispute already exists for this escrow.
  select *
    into dispute_row
    from public.disputes d
   where d.escrow_id = escrow_row.escrow_id;

  if found then
    raise exception 'DISPUTE_ALREADY_EXISTS';
  end if;

  if escrow_row.status not in ('HOLD', 'DELIVERED') then
    raise exception 'INVALID_STATE:%', escrow_row.status;
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
      escrow_id,
      opened_by,
      reason_code,
      status,
      resolution,
      opened_notes_redacted,
      opened_at,
      created_at,
      updated_at
    )
    values (
      escrow_row.escrow_id,
      v_opened_by,
      v_reason,
      'OPEN',
      'NONE_YET',
      v_opened_notes,
      v_now,
      v_now,
      v_now
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

  -- Ensure an evidence pack exists (eager creation for AC).
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

create or replace function public.dispute_resolve_v0(
  p_dispute_id uuid,
  p_resolution text,
  p_resolution_notes_redacted text,
  p_psp_reference_id text
)
returns table (
  dispute_id uuid,
  status dispute_status,
  resolution dispute_resolution,
  resolved_at timestamptz,
  escrow_status escrow_status,
  psp_payout_id text,
  psp_refund_id text
)
language plpgsql
as $$
declare
  dispute_row public.disputes%rowtype;
  escrow_row public.escrows%rowtype;
  v_now timestamptz := now();
  v_resolution_text text;
  v_resolution dispute_resolution;
  v_ref text;
  v_notes text;
begin
  select *
    into dispute_row
    from public.disputes d
   where d.dispute_id = p_dispute_id
   for update;

  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;

  select *
    into escrow_row
    from public.escrows e
   where e.escrow_id = dispute_row.escrow_id
   for update;

  if not found then
    raise exception 'ESCROW_NOT_FOUND';
  end if;

  v_resolution_text := upper(coalesce(nullif(btrim(p_resolution), ''), ''));
  if v_resolution_text not in ('REFUND', 'RELEASE') then
    raise exception 'VALIDATION_ERROR:RESOLUTION';
  end if;
  v_resolution := v_resolution_text::dispute_resolution;

  if dispute_row.status = 'RESOLVED' then
    if dispute_row.resolution = v_resolution then
      return query
        select dispute_row.dispute_id,
               dispute_row.status,
               dispute_row.resolution,
               dispute_row.resolved_at,
               escrow_row.status,
               escrow_row.psp_payout_id,
               escrow_row.psp_refund_id;
      return;
    end if;
    raise exception 'DISPUTE_ALREADY_RESOLVED';
  end if;

  if escrow_row.status in ('RELEASED', 'REFUNDED', 'CANCELLED', 'FAILED') then
    raise exception 'ESCROW_FINALIZED';
  end if;
  if escrow_row.status <> 'DISPUTE_OPEN' then
    raise exception 'INVALID_STATE:%', escrow_row.status;
  end if;

  v_ref := nullif(btrim(p_psp_reference_id), '');
  if v_ref is null then
    raise exception 'VALIDATION_ERROR:PSP_REFERENCE_ID';
  end if;

  if v_resolution = 'RELEASE' then
    update public.escrows e
       set status = 'RELEASE_PENDING',
           psp_payout_id = v_ref,
           updated_at = v_now
     where e.escrow_id = escrow_row.escrow_id
     returning * into escrow_row;
  elsif v_resolution = 'REFUND' then
    update public.escrows e
       set status = 'REFUND_PENDING',
           psp_refund_id = v_ref,
           updated_at = v_now
     where e.escrow_id = escrow_row.escrow_id
     returning * into escrow_row;
  end if;

  v_notes := nullif(left(coalesce(p_resolution_notes_redacted, ''), 500), '');

  update public.disputes d
     set status = 'RESOLVED',
         resolution = v_resolution,
         resolution_notes_redacted = v_notes,
         resolved_at = v_now,
         updated_at = v_now
   where d.dispute_id = dispute_row.dispute_id
   returning * into dispute_row;

  return query
    select dispute_row.dispute_id,
           dispute_row.status,
           dispute_row.resolution,
           dispute_row.resolved_at,
           escrow_row.status,
           escrow_row.psp_payout_id,
           escrow_row.psp_refund_id;
end;
$$;
