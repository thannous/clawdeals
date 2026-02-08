-- TI-202/TI-203: Contact reveal v0
--
-- Adds an atomic helper to request contact reveal on an ACCEPTED transaction:
-- - anti-enum (TX_NOT_FOUND on not found or permission denied)
-- - supports NOT_REQUESTED/REQUESTED/APPROVED/DENIED flows
-- - creates/reopens an approval row action_type='contact_reveal' with action_ref_id=tx_id::text
-- - auto-approve path updates transactions + listings to CONTACT_REVEALED
--
-- Also extends resolve_approval() to support action_type='contact_reveal' on both
-- APPROVED and DENIED decisions (updates transaction + listing).

create or replace function public.transaction_request_contact_reveal_v0(
  p_tx_id uuid,
  p_actor_agent_id uuid,
  p_auto_approve boolean
)
returns table (
  tx_id uuid,
  tx_status transaction_status,
  contact_reveal_state contact_reveal_state,
  contact_revealed_at timestamptz,
  approval_id uuid
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
  if p_tx_id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

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

  if tx_row.contact_reveal_state = 'APPROVED' then
    return query
      select tx_row.tx_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             null::uuid;
    return;
  end if;

  -- Safe default: contact reveal is only actionable on ACCEPTED.
  if tx_row.status <> 'ACCEPTED' then
    raise exception 'TX_NOT_ACCEPTED:%', tx_row.status;
  end if;

  select *
    into listing_row
    from public.listings l
   where l.listing_id = tx_row.listing_id
   for update;

  if not found then
    -- Defensive; preserve anti-enum behavior.
    raise exception 'TX_NOT_FOUND';
  end if;

  v_owner_id := listing_row.owner_id::uuid;

  -- Idempotent: if already requested, return the current approval (or recreate defensively).
  if tx_row.contact_reveal_state = 'REQUESTED' then
    select *
      into approval_row
      from public.approvals ap
     where ap.owner_id = v_owner_id
       and ap.action_type = 'contact_reveal'
       and ap.action_ref_id = p_tx_id::text
     order by ap.created_at desc
     limit 1;

    if not found then
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
        p_tx_id::text,
        '{}'::jsonb,
        p_actor_agent_id
      )
      returning * into approval_row;
    end if;

    return query
      select tx_row.tx_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             approval_row.approval_id;
    return;
  end if;

  -- If previously denied, force a new approval (no auto-approve override).
  if tx_row.contact_reveal_state = 'DENIED' then
    v_auto_approve := false;
  end if;

  insert into public.approvals as ap (
    owner_id,
    action_type,
    action_ref,
    action_ref_id,
    action_payload_redacted,
    created_by_agent_id,
    created_at
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
    p_tx_id::text,
    '{}'::jsonb,
    p_actor_agent_id,
    v_now
  )
  on conflict (owner_id, action_type, action_ref_id) do update
    set action_ref = excluded.action_ref,
        action_payload_redacted = excluded.action_payload_redacted,
        created_by_agent_id = excluded.created_by_agent_id,
        state = case when ap.state in ('DENIED', 'EXPIRED', 'CANCELLED') then 'PENDING' else ap.state end,
        resolved_at = case when ap.state in ('DENIED', 'EXPIRED', 'CANCELLED') then null else ap.resolved_at end,
        resolved_by_human_id = case when ap.state in ('DENIED', 'EXPIRED', 'CANCELLED') then null else ap.resolved_by_human_id end,
        created_at = case when ap.state in ('DENIED', 'EXPIRED', 'CANCELLED') then excluded.created_at else ap.created_at end
  returning * into approval_row;

  update public.transactions t
     set contact_reveal_state = 'REQUESTED',
         contact_revealed_at = null,
         updated_at = v_now
   where t.tx_id = tx_row.tx_id
   returning * into tx_row;

  if v_auto_approve then
    -- Reuse the centralized resolver so listing + tx are updated consistently.
    perform public.resolve_approval(approval_row.approval_id, v_owner_id, 'APPROVED', null);

    select *
      into tx_row
      from public.transactions t
     where t.tx_id = p_tx_id;

    return query
      select tx_row.tx_id,
             tx_row.status,
             tx_row.contact_reveal_state,
             tx_row.contact_revealed_at,
             approval_row.approval_id;
    return;
  end if;

  return query
    select tx_row.tx_id,
           tx_row.status,
           tx_row.contact_reveal_state,
           tx_row.contact_revealed_at,
           approval_row.approval_id;
end;
$$;

create or replace function public.resolve_approval(
  p_approval_id uuid,
  p_owner_id uuid,
  p_decision text,
  p_resolved_by uuid
)
returns public.approvals
language plpgsql
as $$
declare
  approval_row public.approvals%rowtype;
  v_listing_id uuid;
  v_target_listing_id uuid;
  v_thread_id uuid;
  v_agent_id uuid;
  v_buyer_agent_id uuid;
  v_seller_agent_id uuid;
  v_action_owner_id uuid;
  v_previous_offer_id uuid;
  v_counter_offer public.offers%rowtype;
  v_offer_id uuid;
  v_offer_amount int;
  v_offer_amount_text text;
  v_offer_currency_text text;
  v_offer_expires_at_text text;
  v_message_body text;
  v_message_type text;
  v_message_payload jsonb;
  v_sender_id uuid;
  v_sender_type message_sender_type;
  v_message_redacted boolean;
  v_warning_payload jsonb;
  v_tx_id uuid;
  v_tx public.transactions%rowtype;
begin
  select *
    into approval_row
    from public.approvals ap
   where ap.approval_id = p_approval_id
     and ap.owner_id = p_owner_id
   for update;

  if not found then
    raise exception 'approval not found';
  end if;

  if approval_row.state <> 'PENDING' then
    return approval_row;
  end if;

  if p_decision = 'DENIED' then
    if approval_row.action_type = 'contact_reveal' then
      v_tx_id := nullif(approval_row.action_ref_id, '')::uuid;
      if v_tx_id is null then
        raise exception 'tx_id required';
      end if;

      select *
        into v_tx
        from public.transactions t
       where t.tx_id = v_tx_id
       for update;

      if not found then
        raise exception 'tx not found';
      end if;

      if v_tx.contact_reveal_state = 'APPROVED' then
        raise exception 'contact reveal already approved';
      end if;

      update public.transactions t
         set contact_reveal_state = 'DENIED',
             contact_revealed_at = null,
             updated_at = now()
       where t.tx_id = v_tx_id;

      update public.listings l
         set status = 'RESERVED',
             updated_at = now()
       where l.listing_id = v_tx.listing_id;

      if not found then
        raise exception 'listing not found';
      end if;
    end if;

    update public.approvals
       set state = 'DENIED',
           resolved_at = now(),
           resolved_by_human_id = p_resolved_by
     where approval_id = p_approval_id
     returning * into approval_row;
    return approval_row;
  end if;

  if p_decision <> 'APPROVED' then
    raise exception 'invalid decision';
  end if;

  v_warning_payload := jsonb_build_object(
    'type', 'warning',
    'code', 'external_link_detected',
    'text', 'Avoid external payment links. Use approved flow only.'
  );

  if approval_row.action_type = 'thread.create' then
    v_listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;
    v_agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    v_buyer_agent_id := nullif(approval_row.action_ref->>'buyer_agent_id', '')::uuid;
    v_seller_agent_id := nullif(approval_row.action_ref->>'seller_agent_id', '')::uuid;
    v_action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;

    if v_listing_id is null then
      raise exception 'listing_id required';
    end if;

    if v_seller_agent_id is null then
      select l.seller_agent_id, l.owner_id
        into v_seller_agent_id, v_action_owner_id
        from public.listings l
       where l.listing_id = v_listing_id;
    end if;

    v_buyer_agent_id := coalesce(v_buyer_agent_id, v_agent_id);

    insert into public.threads (listing_id, owner_id, buyer_agent_id, seller_agent_id, status)
    values (v_listing_id, v_action_owner_id, v_buyer_agent_id, v_seller_agent_id, 'OPEN')
    returning thread_id into v_thread_id;

    v_message_redacted := coalesce(nullif(approval_row.action_ref->>'message_redacted', '')::boolean, false);

    -- Preferred: typed payload stored as JSONB in action_payload_redacted.
    v_message_payload := approval_row.action_payload_redacted->'payload';

    -- Backward compat: legacy approvals stored `body` + `message_type`.
    if v_message_payload is null then
      v_message_type := nullif(approval_row.action_ref->>'message_type', '');
      v_message_body := approval_row.action_payload_redacted->>'body';
      if v_message_body is not null and v_message_body <> '' and v_message_type is not null and v_message_type <> '' then
        if v_message_type in ('question', 'answer', 'info') then
          v_message_payload := jsonb_build_object('type', v_message_type, 'text', v_message_body);
        elsif v_message_type = 'warning' then
          if left(v_message_body, 1) = '{' then
            v_message_payload := (v_message_body::jsonb || jsonb_build_object('type', 'warning'));
          else
            v_message_payload := jsonb_build_object('type', 'warning', 'text', v_message_body);
          end if;
        else
          v_message_payload := jsonb_build_object('type', v_message_type);
        end if;
      end if;
    end if;

    if v_message_payload is not null and v_message_payload <> '{}'::jsonb then
      v_message_type := nullif(v_message_payload->>'type', '');
      v_sender_id := coalesce(v_buyer_agent_id, v_action_owner_id);
      if v_sender_id is null then
        raise exception 'sender_id required';
      end if;
      v_sender_type := case when v_buyer_agent_id is not null then 'agent'::message_sender_type else 'human'::message_sender_type end;

      insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
      values (
        v_thread_id,
        v_sender_id,
        v_sender_type,
        case when v_message_payload ? 'text' then nullif(v_message_payload->>'text', '') else null end,
        v_message_type::message_type,
        v_message_payload,
        v_message_redacted
      );

      if v_message_redacted then
        insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
        values (
          v_thread_id,
          '00000000-0000-0000-0000-000000000000',
          'system'::message_sender_type,
          null,
          'warning'::message_type,
          v_warning_payload,
          false
        );
      end if;
    end if;
  elsif approval_row.action_type = 'message.send' then
    v_thread_id := nullif(approval_row.action_ref->>'thread_id', '')::uuid;
    v_agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    v_action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;
    v_message_type := nullif(approval_row.action_ref->>'message_type', '');
    v_message_redacted := coalesce(nullif(approval_row.action_ref->>'message_redacted', '')::boolean, false);

    if v_thread_id is null then
      raise exception 'thread_id required';
    end if;

    -- Preferred: typed payload stored as JSONB in action_payload_redacted.
    v_message_payload := approval_row.action_payload_redacted->'payload';

    -- Backward compat: legacy approvals stored `body` + `message_type`.
    if v_message_payload is null then
      v_message_body := approval_row.action_payload_redacted->>'body';
      if v_message_body is null or v_message_body = '' then
        raise exception 'body required';
      end if;
      if v_message_type is null or v_message_type = '' then
        raise exception 'message_type required';
      end if;
      if v_message_type in ('question', 'answer', 'info') then
        v_message_payload := jsonb_build_object('type', v_message_type, 'text', v_message_body);
      elsif v_message_type = 'warning' then
        if left(v_message_body, 1) = '{' then
          v_message_payload := (v_message_body::jsonb || jsonb_build_object('type', 'warning'));
        else
          v_message_payload := jsonb_build_object('type', 'warning', 'text', v_message_body);
        end if;
      else
        v_message_payload := jsonb_build_object('type', v_message_type);
      end if;
    end if;

    v_sender_id := coalesce(v_agent_id, v_action_owner_id);
    if v_sender_id is null then
      raise exception 'sender_id required';
    end if;
    v_sender_type := case when v_agent_id is not null then 'agent'::message_sender_type else 'human'::message_sender_type end;
    v_message_type := nullif(v_message_payload->>'type', '');

    insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
    values (
      v_thread_id,
      v_sender_id,
      v_sender_type,
      case when v_message_payload ? 'text' then nullif(v_message_payload->>'text', '') else null end,
      v_message_type::message_type,
      v_message_payload,
      v_message_redacted
    );

    if v_message_redacted then
      insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
      values (
        v_thread_id,
        '00000000-0000-0000-0000-000000000000',
        'system'::message_sender_type,
        null,
        'warning'::message_type,
        v_warning_payload,
        false
      );
    end if;
  elsif approval_row.action_type = 'listing_publish' then
    v_target_listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;

    if v_target_listing_id is null then
      raise exception 'listing_id required';
    end if;

    update public.listings l
       set status = 'LIVE',
           updated_at = now()
     where l.listing_id = v_target_listing_id;

    if not found then
      raise exception 'listing not found';
    end if;
  elsif approval_row.action_type = 'offer_over_budget' then
    v_thread_id := nullif(approval_row.action_ref->>'thread_id', '')::uuid;
    v_agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    v_buyer_agent_id := nullif(approval_row.action_ref->>'buyer_agent_id', '')::uuid;
    v_seller_agent_id := nullif(approval_row.action_ref->>'seller_agent_id', '')::uuid;
    v_listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;
    v_previous_offer_id := nullif(approval_row.action_ref->>'previous_offer_id', '')::uuid;

    if v_thread_id is null then
      raise exception 'thread_id required';
    end if;

    -- Derive missing context from the thread.
    select t.listing_id, t.buyer_agent_id, t.seller_agent_id
      into v_listing_id, v_buyer_agent_id, v_seller_agent_id
      from public.threads t
     where t.thread_id = v_thread_id;

    if not found then
      raise exception 'thread not found';
    end if;

    v_offer_amount_text := nullif(approval_row.action_payload_redacted->>'amount', '');
    if v_offer_amount_text is null then
      v_offer_amount_text := nullif(approval_row.action_payload_redacted->'offer'->>'amount', '');
    end if;
    if v_offer_amount_text is null then
      v_offer_amount_text := nullif(approval_row.action_payload_redacted->'payload'->>'amount', '');
    end if;
    if v_offer_amount_text is null then
      v_offer_amount_text := nullif(approval_row.action_ref->>'amount', '');
    end if;

    if v_offer_amount_text is null then
      raise exception 'amount required';
    end if;
    v_offer_amount := v_offer_amount_text::int;

    v_offer_currency_text := nullif(approval_row.action_payload_redacted->>'currency', '');
    if v_offer_currency_text is null then
      v_offer_currency_text := nullif(approval_row.action_payload_redacted->'offer'->>'currency', '');
    end if;
    if v_offer_currency_text is null then
      v_offer_currency_text := nullif(approval_row.action_payload_redacted->'payload'->>'currency', '');
    end if;
    if v_offer_currency_text is null then
      v_offer_currency_text := nullif(approval_row.action_ref->>'currency', '');
    end if;

    if v_offer_currency_text is null then
      raise exception 'currency required';
    end if;

    v_offer_expires_at_text := nullif(approval_row.action_payload_redacted->>'expires_at', '');
    if v_offer_expires_at_text is null then
      v_offer_expires_at_text := nullif(approval_row.action_payload_redacted->'offer'->>'expires_at', '');
    end if;
    if v_offer_expires_at_text is null then
      v_offer_expires_at_text := nullif(approval_row.action_payload_redacted->'payload'->>'expires_at', '');
    end if;
    if v_offer_expires_at_text is null then
      v_offer_expires_at_text := nullif(approval_row.action_ref->>'expires_at', '');
    end if;

    if v_offer_expires_at_text is null then
      raise exception 'expires_at required';
    end if;

    if v_previous_offer_id is not null then
      v_sender_id := coalesce(v_agent_id, v_buyer_agent_id, v_seller_agent_id);
      if v_sender_id is null then
        raise exception 'sender_id required';
      end if;

      select *
        into v_counter_offer
        from public.counter_offer_v0(
          v_previous_offer_id,
          v_offer_amount,
          v_offer_currency_text::char(3),
          v_offer_expires_at_text::timestamptz,
          v_sender_id
        );

      v_offer_id := v_counter_offer.offer_id;
    else
      insert into public.offers (thread_id, listing_id, buyer_agent_id, seller_agent_id, amount, currency, expires_at, status)
      values (
        v_thread_id,
        v_listing_id,
        v_buyer_agent_id,
        v_seller_agent_id,
        v_offer_amount,
        v_offer_currency_text::char(3),
        v_offer_expires_at_text::timestamptz,
        'CREATED'
      )
      returning offer_id into v_offer_id;

      v_sender_id := coalesce(v_buyer_agent_id, v_agent_id);
      if v_sender_id is null then
        raise exception 'sender_id required';
      end if;
      v_sender_type := 'agent'::message_sender_type;

      v_message_payload := jsonb_build_object(
        'type', 'offer',
        'offer_id', v_offer_id
      );
      v_message_type := nullif(v_message_payload->>'type', '');

      insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
      values (
        v_thread_id,
        v_sender_id,
        v_sender_type,
        null,
        v_message_type::message_type,
        v_message_payload,
        false
      );
    end if;
  elsif approval_row.action_type = 'contact_reveal' then
    v_tx_id := nullif(approval_row.action_ref_id, '')::uuid;
    if v_tx_id is null then
      raise exception 'tx_id required';
    end if;

    select *
      into v_tx
      from public.transactions t
     where t.tx_id = v_tx_id
     for update;

    if not found then
      raise exception 'tx not found';
    end if;

    if v_tx.status <> 'ACCEPTED' and v_tx.status <> 'CONTACT_REVEALED' then
      raise exception 'tx not accepted';
    end if;

    update public.transactions t
       set status = 'CONTACT_REVEALED',
           contact_reveal_state = 'APPROVED',
           contact_revealed_at = coalesce(t.contact_revealed_at, now()),
           updated_at = now()
     where t.tx_id = v_tx_id
     returning * into v_tx;

    update public.listings l
       set status = 'CONTACT_REVEALED',
           updated_at = now()
     where l.listing_id = v_tx.listing_id;

    if not found then
      raise exception 'listing not found';
    end if;
  else
    raise exception 'unsupported action_type %', approval_row.action_type;
  end if;

  update public.approvals
     set state = 'APPROVED',
         resolved_at = now(),
         resolved_by_human_id = p_resolved_by
   where approval_id = p_approval_id
   returning * into approval_row;

  return approval_row;
end;
$$;

