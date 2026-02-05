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
  thread_id uuid;
  agent_id uuid;
  action_owner_id uuid;
  message_body text;
  message_type text;
  sender_id uuid;
  sender_type text;
begin
  select a.*
    into approval_row
    from public.approvals a
   where a.approval_id = p_approval_id
     and a.owner_id = p_owner_id
   for update;

  if not found then
    raise exception 'approval not found';
  end if;

  if approval_row.state <> 'PENDING' then
    return approval_row;
  end if;

  if p_decision = 'DENIED' then
    update public.approvals a
       set state = 'DENIED',
           resolved_at = now(),
           resolved_by_human_id = p_resolved_by
     where a.approval_id = p_approval_id
     returning * into approval_row;
    return approval_row;
  end if;

  if p_decision <> 'APPROVED' then
    raise exception 'invalid decision';
  end if;

  if approval_row.action_type = 'thread.create' then
    listing_id := nullif(approval_row.action_ref->>'listing_id', '')::uuid;
    agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;

    if listing_id is null then
      raise exception 'listing_id required';
    end if;

    insert into public.threads (listing_id, owner_id, agent_id)
    values (listing_id, action_owner_id, agent_id);
  elsif approval_row.action_type = 'message.send' then
    thread_id := nullif(approval_row.action_ref->>'thread_id', '')::uuid;
    agent_id := nullif(approval_row.action_ref->>'agent_id', '')::uuid;
    action_owner_id := nullif(approval_row.action_ref->>'owner_id', '')::uuid;
    message_type := nullif(approval_row.action_ref->>'message_type', '');
    message_body := approval_row.action_payload_redacted->>'body';

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

    insert into public.messages (thread_id, sender_id, sender_type, body, message_type)
    values (thread_id, sender_id, sender_type, message_body, message_type);
  else
    raise exception 'unsupported action_type %', approval_row.action_type;
  end if;

  update public.approvals a
     set state = 'APPROVED',
         resolved_at = now(),
         resolved_by_human_id = p_resolved_by
   where a.approval_id = p_approval_id
   returning * into approval_row;

  return approval_row;
end;
$$;
