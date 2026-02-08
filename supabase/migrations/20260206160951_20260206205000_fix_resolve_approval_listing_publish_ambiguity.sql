-- Fix: avoid PL/pgSQL variable/column ambiguity for listing_publish branch

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
  listing_id uuid;
  target_listing_id uuid;
  thread_id uuid;
  agent_id uuid;
  action_owner_id uuid;
  message_body text;
  message_type text;
  sender_id uuid;
  sender_type text;
  message_redacted boolean;
  warning_body text;
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

  warning_body := '{"code":"external_link_detected","text":"Avoid external payment links. Use approved flow only."}';

  if approval_row.action_type = 'thread.create' then
    listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;
    agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;

    if listing_id is null then
      raise exception 'listing_id required';
    end if;

    insert into public.threads (listing_id, owner_id, agent_id)
    values (listing_id, action_owner_id, agent_id)
    returning id into thread_id;

    -- Optional initial message (stored pre-redacted by the API layer).
    message_type := nullif(approval_row.action_ref->>'message_type', '');
    message_body := approval_row.action_payload_redacted->>'body';
    message_redacted := coalesce(nullif(approval_row.action_ref->>'message_redacted', '')::boolean, false);

    if message_body is not null and message_body <> '' and message_type is not null and message_type <> '' then
      sender_id := coalesce(agent_id, action_owner_id);
      if sender_id is null then
        raise exception 'sender_id required';
      end if;
      sender_type := case when agent_id is not null then 'agent' else 'owner' end;

      insert into public.messages (thread_id, sender_id, sender_type, body, message_type, redacted)
      values (thread_id, sender_id, sender_type, message_body, message_type, message_redacted);

      if message_redacted then
        insert into public.messages (thread_id, sender_id, sender_type, body, message_type, redacted)
        values (thread_id, '00000000-0000-0000-0000-000000000000', 'system', warning_body, 'warning', false);
      end if;
    end if;
  elsif approval_row.action_type = 'message.send' then
    thread_id := nullif(approval_row.action_ref->>'thread_id', '')::uuid;
    agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;
    message_type := nullif(approval_row.action_ref->>'message_type', '');
    message_body := approval_row.action_payload_redacted->>'body';
    message_redacted := coalesce(nullif(approval_row.action_ref->>'message_redacted', '')::boolean, false);

    if thread_id is null then
      raise exception 'thread_id required';
    end if;
    if message_body is null or message_body = '' then
      raise exception 'body required';
    end if;

    sender_id := coalesce(agent_id, action_owner_id);
    if sender_id is null then
      raise exception 'sender_id required';
    end if;

    sender_type := case when agent_id is not null then 'agent' else 'owner' end;

    insert into public.messages (thread_id, sender_id, sender_type, body, message_type, redacted)
    values (thread_id, sender_id, sender_type, message_body, message_type, message_redacted);

    if message_redacted then
      insert into public.messages (thread_id, sender_id, sender_type, body, message_type, redacted)
      values (thread_id, '00000000-0000-0000-0000-000000000000', 'system', warning_body, 'warning', false);
    end if;
  elsif approval_row.action_type = 'listing_publish' then
    target_listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;

    if target_listing_id is null then
      raise exception 'listing_id required';
    end if;

    update public.listings l
       set status = 'LIVE',
           updated_at = now()
     where l.listing_id = target_listing_id;

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

