-- TI-296: resolve_approval() support for channel pairing approvals.
-- Adds action_type='channel.pair' handling (APPROVED activates identity; DENIED revokes it).
--
-- Note: Do NOT drop the 4-arg resolve_approval() overload. Some DB-side functions call it positionally.

-- TI-279: Add resolved_reason_text to approvals and update the resolve_approval RPC
-- to accept an optional reason parameter.

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS resolved_reason_text text;

-- Recreate the function with the extra p_reason parameter (DEFAULT NULL for backward compat).
-- The body is identical to the version in 20260208123000_contact_reveal_v0.sql except:
-- 1. New parameter: p_reason text DEFAULT NULL
-- 2. DENIED UPDATE (line ~288): adds resolved_reason_text = p_reason
-- 3. APPROVED UPDATE (line ~630): adds resolved_reason_text = p_reason

create or replace function public.resolve_approval(
  p_approval_id uuid,
  p_owner_id uuid,
  p_decision text,
  p_resolved_by uuid,
  p_reason text default null
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
  v_channel_identity_id uuid;
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
    elsif approval_row.action_type = 'channel.pair' then
      v_channel_identity_id := nullif(approval_row.action_ref_id, '')::uuid;
      if v_channel_identity_id is null then
        raise exception 'channel_identity_id required';
      end if;

      update public.channel_identities ci
         set state = 'REVOKED',
             revoked_at = now(),
             pairing_code_hash = null,
             pairing_expires_at = null
       where ci.channel_identity_id = v_channel_identity_id
         and ci.owner_id = approval_row.owner_id
         and ci.state = 'PENDING';

      if not found then
        raise exception 'channel identity not found';
      end if;
    end if;

    update public.approvals
       set state = 'DENIED',
           resolved_at = now(),
           resolved_by_human_id = p_resolved_by,
           resolved_reason_text = p_reason
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

    v_message_payload := approval_row.action_payload_redacted->'payload';

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

    v_message_payload := approval_row.action_payload_redacted->'payload';

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
  elsif approval_row.action_type = 'channel.pair' then
    v_channel_identity_id := nullif(approval_row.action_ref_id, '')::uuid;
    if v_channel_identity_id is null then
      raise exception 'channel_identity_id required';
    end if;

    update public.channel_identities ci
       set state = 'ACTIVE',
           role = 'owner',
           approved_at = now(),
           approved_by_human_id = p_resolved_by,
           pairing_code_hash = null,
           pairing_expires_at = null,
           revoked_at = null
     where ci.channel_identity_id = v_channel_identity_id
       and ci.owner_id = approval_row.owner_id
       and ci.state = 'PENDING';

    if not found then
      raise exception 'channel identity not found';
    end if;
  else
    raise exception 'unsupported action_type %', approval_row.action_type;
  end if;

  update public.approvals
     set state = 'APPROVED',
         resolved_at = now(),
         resolved_by_human_id = p_resolved_by,
         resolved_reason_text = p_reason
   where approval_id = p_approval_id
   returning * into approval_row;

  return approval_row;
end;
$$;

alter function public.resolve_approval(uuid, uuid, text, uuid, text) set search_path = pg_catalog, public;
