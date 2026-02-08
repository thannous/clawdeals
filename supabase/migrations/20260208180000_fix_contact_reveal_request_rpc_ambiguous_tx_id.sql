-- TI-202/TI-203: Fix contact reveal request RPC
--
-- The initial `transaction_request_contact_reveal_v0` version returned TABLE columns
-- named `tx_id`, `listing_id`, etc. Unqualified column references in UPDATE statements
-- became ambiguous (PL/pgSQL output vars vs table columns) and surfaced as:
--   column reference "tx_id" is ambiguous
--
-- This migration recreates the function with fully qualified column references.

drop function if exists public.transaction_request_contact_reveal_v0(uuid, uuid, boolean);

create or replace function public.transaction_request_contact_reveal_v0(
  p_tx_id uuid,
  p_actor_agent_id uuid,
  p_auto_approve boolean
)
returns table (
  tx_id uuid,
  listing_id uuid,
  thread_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_status transaction_status,
  contact_reveal_state contact_reveal_state,
  contact_revealed_at timestamptz,
  approval_id uuid,
  listing_status listing_status
)
language plpgsql
as $$
declare
  tx_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
  approval_row public.approvals%rowtype;
  v_owner_id uuid;
  v_now timestamptz := now();
  v_auto_approve boolean := coalesce(p_auto_approve, false);
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

  select *
    into listing_row
    from public.listings l
   where l.listing_id = tx_row.listing_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  if listing_row.owner_id is null or btrim(listing_row.owner_id) = '' then
    raise exception 'OWNER_ID_REQUIRED';
  end if;

  v_owner_id := listing_row.owner_id::uuid;

  -- Idempotent: already approved.
  if tx_row.contact_reveal_state = 'APPROVED' then
    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.thread_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             null::uuid,
             listing_row.status;
    return;
  end if;

  -- Safe default: only ACCEPTED transactions can request reveal.
  if tx_row.status <> 'ACCEPTED' then
    raise exception 'TX_NOT_ACCEPTED:%', tx_row.status;
  end if;

  -- Safe default: if previously denied, require manual approval (ignore p_auto_approve).
  if tx_row.contact_reveal_state = 'DENIED' then
    v_auto_approve := false;
  end if;

  -- Auto-approve path (no approval row).
  if v_auto_approve then
    update public.transactions t
       set contact_reveal_state = 'APPROVED',
           status = 'CONTACT_REVEALED',
           contact_revealed_at = coalesce(t.contact_revealed_at, v_now),
           updated_at = v_now
     where t.tx_id = tx_row.tx_id
     returning * into tx_row;

    update public.listings l
       set status = 'CONTACT_REVEALED',
           updated_at = v_now
     where l.listing_id = listing_row.listing_id
     returning * into listing_row;

    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.thread_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             null::uuid,
             listing_row.status;
    return;
  end if;

  -- Idempotent: if already requested, return the current approval (or recreate defensively).
  if tx_row.contact_reveal_state = 'REQUESTED' then
    select *
      into approval_row
      from public.approvals ap
     where ap.owner_id = v_owner_id
       and ap.action_type = 'contact_reveal'
       and ap.action_ref_id = tx_row.tx_id::text
     order by ap.created_at desc
     limit 1;

    if not found then
      begin
        insert into public.approvals (
          owner_id,
          action_type,
          action_ref,
          action_ref_id,
          action_payload_redacted,
          created_by_agent_id
        )
        values (
          v_owner_id,
          'contact_reveal',
          jsonb_build_object(
            'tx_id', tx_row.tx_id,
            'listing_id', tx_row.listing_id,
            'thread_id', tx_row.thread_id,
            'buyer_agent_id', tx_row.buyer_agent_id,
            'seller_agent_id', tx_row.seller_agent_id
          ),
          tx_row.tx_id::text,
          '{}'::jsonb,
          p_actor_agent_id
        )
        returning * into approval_row;
      exception when unique_violation then
        select *
          into approval_row
          from public.approvals ap
         where ap.owner_id = v_owner_id
           and ap.action_type = 'contact_reveal'
           and ap.action_ref_id = tx_row.tx_id::text
         limit 1;
      end;
    end if;

    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.thread_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             approval_row.approval_id,
             listing_row.status;
    return;
  end if;

  -- Retry after DENIED: reopen the same approval row (no new row) and set tx to REQUESTED.
  if tx_row.contact_reveal_state = 'DENIED' then
    update public.approvals ap
       set state = 'PENDING',
           resolved_at = null,
           resolved_by_human_id = null,
           created_at = v_now
     where ap.owner_id = v_owner_id
       and ap.action_type = 'contact_reveal'
       and ap.action_ref_id = tx_row.tx_id::text
     returning * into approval_row;

    if not found then
      begin
        insert into public.approvals (
          owner_id,
          action_type,
          action_ref,
          action_ref_id,
          action_payload_redacted,
          created_by_agent_id
        )
        values (
          v_owner_id,
          'contact_reveal',
          jsonb_build_object(
            'tx_id', tx_row.tx_id,
            'listing_id', tx_row.listing_id,
            'thread_id', tx_row.thread_id,
            'buyer_agent_id', tx_row.buyer_agent_id,
            'seller_agent_id', tx_row.seller_agent_id
          ),
          tx_row.tx_id::text,
          '{}'::jsonb,
          p_actor_agent_id
        )
        returning * into approval_row;
      exception when unique_violation then
        select *
          into approval_row
          from public.approvals ap
         where ap.owner_id = v_owner_id
           and ap.action_type = 'contact_reveal'
           and ap.action_ref_id = tx_row.tx_id::text
         limit 1;
      end;
    end if;

    update public.transactions t
       set contact_reveal_state = 'REQUESTED',
           updated_at = v_now
     where t.tx_id = tx_row.tx_id
     returning * into tx_row;

    return query
      select tx_row.tx_id,
             tx_row.listing_id,
             tx_row.thread_id,
             tx_row.buyer_agent_id,
             tx_row.seller_agent_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             approval_row.approval_id,
             listing_row.status;
    return;
  end if;

  -- First request (NOT_REQUESTED): create approval and mark tx as REQUESTED.
  begin
    insert into public.approvals (
      owner_id,
      action_type,
      action_ref,
      action_ref_id,
      action_payload_redacted,
      created_by_agent_id
    )
    values (
      v_owner_id,
      'contact_reveal',
      jsonb_build_object(
        'tx_id', tx_row.tx_id,
        'listing_id', tx_row.listing_id,
        'thread_id', tx_row.thread_id,
        'buyer_agent_id', tx_row.buyer_agent_id,
        'seller_agent_id', tx_row.seller_agent_id
      ),
      tx_row.tx_id::text,
      '{}'::jsonb,
      p_actor_agent_id
    )
    returning * into approval_row;
  exception when unique_violation then
    select *
      into approval_row
      from public.approvals ap
     where ap.owner_id = v_owner_id
       and ap.action_type = 'contact_reveal'
       and ap.action_ref_id = tx_row.tx_id::text
     limit 1;
  end;

  update public.transactions t
     set contact_reveal_state = 'REQUESTED',
         updated_at = v_now
   where t.tx_id = tx_row.tx_id
   returning * into tx_row;

  return query
    select tx_row.tx_id,
           tx_row.listing_id,
           tx_row.thread_id,
           tx_row.buyer_agent_id,
           tx_row.seller_agent_id,
           tx_row.status,
           tx_row.contact_reveal_state,
           tx_row.contact_revealed_at,
           approval_row.approval_id,
           listing_row.status;
end;
$$;

