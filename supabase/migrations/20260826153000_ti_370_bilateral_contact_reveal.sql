-- TI-370: bilateral, owner-bound contact reveal consent.
--
-- Contact details remain sealed until both transaction owners approve their own
-- consent record. The transaction row is the serialization point so approval,
-- denial, revocation, and concurrent requests resolve atomically.

create or replace function public.transaction_request_contact_reveal_v1(
  p_tx_id uuid,
  p_actor_agent_id uuid
)
returns table (
  tx_id uuid,
  listing_id uuid,
  thread_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_status public.transaction_status,
  contact_reveal_state public.contact_reveal_state,
  contact_revealed_at timestamptz,
  approval_id uuid,
  requester_role text,
  buyer_consent_state public.approval_state,
  seller_consent_state public.approval_state
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx public.transactions%rowtype;
  v_buyer_owner_id uuid;
  v_seller_owner_id uuid;
  v_requester_owner_id uuid;
  v_requester_role text;
  v_requester_approval_id uuid;
  v_buyer_state public.approval_state;
  v_seller_state public.approval_state;
  v_now timestamptz := now();
  v_reopen boolean := false;
begin
  select t.*
    into v_tx
    from public.transactions t
   where t.tx_id = p_tx_id
   for update;

  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  if p_actor_agent_id is null
     or (v_tx.buyer_agent_id is distinct from p_actor_agent_id
         and v_tx.seller_agent_id is distinct from p_actor_agent_id) then
    raise exception 'TX_NOT_FOUND';
  end if;

  select a.owner_id into v_buyer_owner_id
    from public.agents a
   where a.id = v_tx.buyer_agent_id;
  select a.owner_id into v_seller_owner_id
    from public.agents a
   where a.id = v_tx.seller_agent_id;

  if v_buyer_owner_id is null or v_seller_owner_id is null then
    raise exception 'OWNER_CONTACT_MISSING';
  end if;
  if v_buyer_owner_id = v_seller_owner_id then
    raise exception 'CONTACT_REVEAL_PARTIES_NOT_DISTINCT';
  end if;

  if not exists (
    select 1
      from public.owners o
     where o.owner_id = v_buyer_owner_id
       and nullif(btrim(o.email), '') is not null
       and o.email_verified_at is not null
       and nullif(btrim(o.phone_e164), '') is not null
       and o.phone_verified_at is not null
  ) or not exists (
    select 1
      from public.owners o
     where o.owner_id = v_seller_owner_id
       and nullif(btrim(o.email), '') is not null
       and o.email_verified_at is not null
       and nullif(btrim(o.phone_e164), '') is not null
       and o.phone_verified_at is not null
  ) then
    raise exception 'OWNER_CONTACT_MISSING';
  end if;

  if p_actor_agent_id = v_tx.buyer_agent_id then
    v_requester_owner_id := v_buyer_owner_id;
    v_requester_role := 'BUYER';
  else
    v_requester_owner_id := v_seller_owner_id;
    v_requester_role := 'SELLER';
  end if;

  if v_tx.contact_reveal_state = 'APPROVED' then
    return query
      select v_tx.tx_id, v_tx.listing_id, v_tx.thread_id,
             v_tx.buyer_agent_id, v_tx.seller_agent_id, v_tx.status,
             v_tx.contact_reveal_state, v_tx.contact_revealed_at,
             null::uuid, v_requester_role,
             'APPROVED'::public.approval_state, 'APPROVED'::public.approval_state;
    return;
  end if;

  if v_tx.status <> 'ACCEPTED' then
    raise exception 'TX_NOT_ACCEPTED:%', v_tx.status;
  end if;

  v_reopen := v_tx.contact_reveal_state in ('NOT_REQUESTED', 'DENIED');

  -- The legacy single-owner approval must never remain actionable.
  update public.approvals ap
     set state = 'CANCELLED',
         resolved_at = coalesce(ap.resolved_at, v_now),
         resolved_reason_text = coalesce(ap.resolved_reason_text, 'Superseded by bilateral consent')
   where ap.action_type = 'contact_reveal'
     and ap.action_ref_id = v_tx.tx_id::text
     and ap.state = 'PENDING';

  insert into public.approvals (
    owner_id, action_type, action_ref, action_ref_id,
    action_payload_redacted, created_by_agent_id, state, created_at
  ) values (
    v_buyer_owner_id,
    'contact_reveal_consent',
    jsonb_build_object(
      'tx_id', v_tx.tx_id,
      'listing_id', v_tx.listing_id,
      'thread_id', v_tx.thread_id,
      'party_role', 'BUYER'
    ),
    v_tx.tx_id::text,
    jsonb_build_object(
      'requested_action', 'reveal_counterparty_contact',
      'party_role', 'BUYER',
      'consequence', 'No contact is revealed until both owners approve'
    ),
    p_actor_agent_id,
    'PENDING',
    v_now
  )
  on conflict (owner_id, action_type, action_ref_id) do update
    set state = case when v_reopen then 'PENDING'::public.approval_state else public.approvals.state end,
        action_ref = excluded.action_ref,
        action_payload_redacted = excluded.action_payload_redacted,
        created_by_agent_id = case when v_reopen then excluded.created_by_agent_id else public.approvals.created_by_agent_id end,
        created_at = case when v_reopen then excluded.created_at else public.approvals.created_at end,
        resolved_at = case when v_reopen then null else public.approvals.resolved_at end,
        resolved_by_human_id = case when v_reopen then null else public.approvals.resolved_by_human_id end,
        resolved_reason_text = case when v_reopen then null else public.approvals.resolved_reason_text end;

  insert into public.approvals (
    owner_id, action_type, action_ref, action_ref_id,
    action_payload_redacted, created_by_agent_id, state, created_at
  ) values (
    v_seller_owner_id,
    'contact_reveal_consent',
    jsonb_build_object(
      'tx_id', v_tx.tx_id,
      'listing_id', v_tx.listing_id,
      'thread_id', v_tx.thread_id,
      'party_role', 'SELLER'
    ),
    v_tx.tx_id::text,
    jsonb_build_object(
      'requested_action', 'reveal_counterparty_contact',
      'party_role', 'SELLER',
      'consequence', 'No contact is revealed until both owners approve'
    ),
    p_actor_agent_id,
    'PENDING',
    v_now
  )
  on conflict (owner_id, action_type, action_ref_id) do update
    set state = case when v_reopen then 'PENDING'::public.approval_state else public.approvals.state end,
        action_ref = excluded.action_ref,
        action_payload_redacted = excluded.action_payload_redacted,
        created_by_agent_id = case when v_reopen then excluded.created_by_agent_id else public.approvals.created_by_agent_id end,
        created_at = case when v_reopen then excluded.created_at else public.approvals.created_at end,
        resolved_at = case when v_reopen then null else public.approvals.resolved_at end,
        resolved_by_human_id = case when v_reopen then null else public.approvals.resolved_by_human_id end,
        resolved_reason_text = case when v_reopen then null else public.approvals.resolved_reason_text end;

  if v_reopen then
    update public.transactions t
       set contact_reveal_state = 'REQUESTED',
           contact_revealed_at = null,
           updated_at = v_now
     where t.tx_id = v_tx.tx_id
     returning t.* into v_tx;
  end if;

  select ap.approval_id
    into v_requester_approval_id
    from public.approvals ap
   where ap.owner_id = v_requester_owner_id
     and ap.action_type = 'contact_reveal_consent'
     and ap.action_ref_id = v_tx.tx_id::text;
  select ap.state into v_buyer_state
    from public.approvals ap
   where ap.owner_id = v_buyer_owner_id
     and ap.action_type = 'contact_reveal_consent'
     and ap.action_ref_id = v_tx.tx_id::text;
  select ap.state into v_seller_state
    from public.approvals ap
   where ap.owner_id = v_seller_owner_id
     and ap.action_type = 'contact_reveal_consent'
     and ap.action_ref_id = v_tx.tx_id::text;

  return query
    select v_tx.tx_id, v_tx.listing_id, v_tx.thread_id,
           v_tx.buyer_agent_id, v_tx.seller_agent_id, v_tx.status,
           v_tx.contact_reveal_state, v_tx.contact_revealed_at,
           v_requester_approval_id, v_requester_role,
           v_buyer_state, v_seller_state;
end;
$$;

create or replace function public.resolve_contact_reveal_consent_v1(
  p_approval_id uuid,
  p_owner_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  resolved_approval_id uuid,
  resolved_state public.approval_state,
  tx_id uuid,
  contact_reveal_state public.contact_reveal_state,
  contact_revealed_at timestamptz,
  tx_status public.transaction_status,
  became_revealed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_approval public.approvals%rowtype;
  v_tx public.transactions%rowtype;
  v_tx_id uuid;
  v_buyer_owner_id uuid;
  v_seller_owner_id uuid;
  v_expected_owner_id uuid;
  v_role text;
  v_buyer_state public.approval_state;
  v_seller_state public.approval_state;
  v_target_state public.approval_state;
  v_now timestamptz := now();
  v_became_revealed boolean := false;
begin
  if p_decision not in ('APPROVED', 'DENIED', 'REVOKED') then
    raise exception 'INVALID_DECISION';
  end if;

  select nullif(ap.action_ref->>'tx_id', '')::uuid
    into v_tx_id
    from public.approvals ap
   where ap.approval_id = p_approval_id
     and ap.owner_id = p_owner_id
     and ap.action_type = 'contact_reveal_consent';

  if v_tx_id is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  -- Global lock order: transaction first, then the owner's approval.
  select t.* into v_tx
    from public.transactions t
   where t.tx_id = v_tx_id
   for update;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;

  select ap.* into v_approval
    from public.approvals ap
   where ap.approval_id = p_approval_id
     and ap.owner_id = p_owner_id
     and ap.action_type = 'contact_reveal_consent'
   for update;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  select a.owner_id into v_buyer_owner_id from public.agents a where a.id = v_tx.buyer_agent_id;
  select a.owner_id into v_seller_owner_id from public.agents a where a.id = v_tx.seller_agent_id;
  v_role := upper(coalesce(v_approval.action_ref->>'party_role', ''));
  v_expected_owner_id := case v_role
    when 'BUYER' then v_buyer_owner_id
    when 'SELLER' then v_seller_owner_id
    else null
  end;

  if v_expected_owner_id is null or v_expected_owner_id <> p_owner_id then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  v_target_state := case p_decision
    when 'APPROVED' then 'APPROVED'::public.approval_state
    when 'DENIED' then 'DENIED'::public.approval_state
    else 'CANCELLED'::public.approval_state
  end;

  if v_tx.contact_reveal_state = 'APPROVED' then
    if v_approval.state = 'APPROVED' and p_decision = 'APPROVED' then
      return query select v_approval.approval_id, v_approval.state, v_tx.tx_id,
        v_tx.contact_reveal_state, v_tx.contact_revealed_at, v_tx.status, false;
      return;
    end if;
    raise exception 'CONTACT_REVEAL_FINALIZED';
  end if;

  if v_approval.state <> 'PENDING' then
    if v_approval.state = v_target_state then
      return query select v_approval.approval_id, v_approval.state, v_tx.tx_id,
        v_tx.contact_reveal_state, v_tx.contact_revealed_at, v_tx.status, false;
      return;
    end if;
    if not (v_approval.state = 'APPROVED' and p_decision = 'REVOKED'
            and v_tx.contact_reveal_state = 'REQUESTED') then
      raise exception 'APPROVAL_ALREADY_RESOLVED';
    end if;
  end if;

  if v_tx.contact_reveal_state <> 'REQUESTED' then
    raise exception 'CONTACT_REVEAL_NOT_REQUESTED';
  end if;

  update public.approvals ap
     set state = v_target_state,
         resolved_at = v_now,
         resolved_by_human_id = p_owner_id,
         resolved_reason_text = nullif(btrim(p_reason), '')
   where ap.approval_id = v_approval.approval_id
   returning ap.* into v_approval;

  if p_decision in ('DENIED', 'REVOKED') then
    update public.approvals ap
       set state = 'CANCELLED',
           resolved_at = coalesce(ap.resolved_at, v_now),
           resolved_reason_text = coalesce(ap.resolved_reason_text, 'Counterparty consent stopped')
     where ap.action_type = 'contact_reveal_consent'
       and ap.action_ref_id = v_tx.tx_id::text
       and ap.approval_id <> v_approval.approval_id
       and ap.state = 'PENDING';

    update public.transactions t
       set contact_reveal_state = 'DENIED',
           contact_revealed_at = null,
           updated_at = v_now
     where t.tx_id = v_tx.tx_id
     returning t.* into v_tx;
  else
    select ap.state into v_buyer_state
      from public.approvals ap
     where ap.owner_id = v_buyer_owner_id
       and ap.action_type = 'contact_reveal_consent'
       and ap.action_ref_id = v_tx.tx_id::text;
    select ap.state into v_seller_state
      from public.approvals ap
     where ap.owner_id = v_seller_owner_id
       and ap.action_type = 'contact_reveal_consent'
       and ap.action_ref_id = v_tx.tx_id::text;

    if v_buyer_state = 'APPROVED' and v_seller_state = 'APPROVED' then
      if not exists (
        select 1 from public.owners o
         where o.owner_id = v_buyer_owner_id
           and nullif(btrim(o.email), '') is not null and o.email_verified_at is not null
           and nullif(btrim(o.phone_e164), '') is not null and o.phone_verified_at is not null
      ) or not exists (
        select 1 from public.owners o
         where o.owner_id = v_seller_owner_id
           and nullif(btrim(o.email), '') is not null and o.email_verified_at is not null
           and nullif(btrim(o.phone_e164), '') is not null and o.phone_verified_at is not null
      ) then
        raise exception 'OWNER_CONTACT_MISSING';
      end if;

      update public.transactions t
         set contact_reveal_state = 'APPROVED',
             status = 'CONTACT_REVEALED',
             contact_revealed_at = coalesce(t.contact_revealed_at, v_now),
             updated_at = v_now
       where t.tx_id = v_tx.tx_id
       returning t.* into v_tx;

      update public.listings l
         set status = 'CONTACT_REVEALED', updated_at = v_now
       where l.listing_id = v_tx.listing_id;
      v_became_revealed := true;
    end if;
  end if;

  return query select v_approval.approval_id, v_approval.state, v_tx.tx_id,
    v_tx.contact_reveal_state, v_tx.contact_revealed_at, v_tx.status, v_became_revealed;
end;
$$;

revoke all on function public.transaction_request_contact_reveal_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transaction_request_contact_reveal_v1(uuid, uuid) to service_role;
revoke all on function public.resolve_contact_reveal_consent_v1(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_contact_reveal_consent_v1(uuid, uuid, text, text) to service_role;
