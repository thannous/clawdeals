-- TI-200: Counter offers v0
--
-- Adds an atomic helper to counter an existing offer:
-- - old offer: CREATED -> COUNTERED
-- - new offer: CREATED with previous_offer_id pointing to old offer
-- - inserts a typed message: counter_offer
--
-- Also extends resolve_approval() so offer_over_budget approvals can resolve
-- counter offers when action_ref.previous_offer_id is set.

create or replace function public.counter_offer_v0(
  p_previous_offer_id uuid,
  p_amount int,
  p_currency char(3),
  p_expires_at timestamptz,
  p_sender_id uuid
)
returns public.offers
language plpgsql
as $$
declare
  v_previous public.offers%rowtype;
  v_new public.offers%rowtype;
begin
  if p_previous_offer_id is null then
    raise exception 'previous_offer_id required';
  end if;
  if p_sender_id is null then
    raise exception 'sender_id required';
  end if;

  select *
    into v_previous
    from public.offers o
   where o.offer_id = p_previous_offer_id
   for update;

  if not found then
    raise exception 'offer not found';
  end if;

  if v_previous.status <> 'CREATED' then
    raise exception 'offer not counterable';
  end if;

  update public.offers
     set status = 'COUNTERED',
         updated_at = now()
   where offer_id = p_previous_offer_id
     and status = 'CREATED';

  if not found then
    raise exception 'offer not counterable';
  end if;

  insert into public.offers (
    thread_id,
    listing_id,
    buyer_agent_id,
    seller_agent_id,
    previous_offer_id,
    amount,
    currency,
    expires_at,
    status
  )
  values (
    v_previous.thread_id,
    v_previous.listing_id,
    v_previous.buyer_agent_id,
    v_previous.seller_agent_id,
    p_previous_offer_id,
    p_amount,
    p_currency,
    p_expires_at,
    'CREATED'
  )
  returning * into v_new;

  insert into public.messages (thread_id, sender_id, sender_type, body, type, payload, redacted)
  values (
    v_new.thread_id,
    p_sender_id,
    'agent'::message_sender_type,
    null,
    'counter_offer'::message_type,
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
