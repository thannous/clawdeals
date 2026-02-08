-- TI-196/TI-197: Threads + typed messages v0 (Phase 3 messaging)
--
-- This migration upgrades the early placeholder `threads`/`messages` tables to the
-- Phase 3 v0 model (buyer/seller participants, typed messages with JSONB payload),
-- and updates `public.resolve_approval()` to insert rows in the new shape.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'thread_status') then
    create type thread_status as enum ('OPEN', 'CLOSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_sender_type') then
    create type message_sender_type as enum ('agent', 'human', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_type') then
    create type message_type as enum (
      'question',
      'answer',
      'info',
      'warning',
      'offer',
      'counter_offer',
      'accept',
      'decline',
      'cancel'
    );
  end if;
end $$;

-- Data cleanup (compat):
-- Older API stubs allowed self-threads (buyer == seller) and threads without a buyer agent.
-- These are invalid in the v0 model, so we delete them before adding constraints.
delete from public.threads t
using public.listings l
where t.listing_id = l.listing_id
  and t.agent_id is not null
  and t.agent_id <> ''
  and t.agent_id = l.seller_agent_id::text;

delete from public.threads
where agent_id is null or agent_id = '';

-- Drop rows with invalid UUID agent IDs (cannot be migrated safely).
delete from public.threads
where agent_id is not null
  and agent_id <> ''
  and agent_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- THREADS
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'thread_id'
  ) then
    alter table public.threads rename column id to thread_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'agent_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'buyer_agent_id'
  ) then
    alter table public.threads rename column agent_id to buyer_agent_id;
  end if;
end $$;

alter table public.threads
  add column if not exists seller_agent_id uuid,
  add column if not exists status thread_status not null default 'OPEN';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'buyer_agent_id'
      and udt_name <> 'uuid'
  ) then
    alter table public.threads
      alter column buyer_agent_id type uuid
      using (
        case
          when buyer_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then buyer_agent_id::uuid
          else null
        end
      );
  end if;
end $$;

-- Safety: drop any remaining rows that couldn't be migrated (invalid buyer_agent_id -> NULL).
delete from public.threads
where buyer_agent_id is null;

do $$
begin
  -- `threads.owner_id` is legacy text in some environments and uuid in others.
  -- Backfill safely without uuid/text coercion errors.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'threads'
      and column_name = 'owner_id'
      and udt_name = 'uuid'
  ) then
    update public.threads t
    set
      seller_agent_id = l.seller_agent_id,
      owner_id = coalesce(
        t.owner_id,
        case
          when l.owner_id is null or l.owner_id::text = '' then null
          when l.owner_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then l.owner_id::text::uuid
          else null
        end
      )
    from public.listings l
    where l.listing_id = t.listing_id
      and (t.seller_agent_id is null or t.owner_id is null);
  else
    update public.threads t
    set
      seller_agent_id = l.seller_agent_id,
      owner_id = coalesce(t.owner_id, l.owner_id::text)
    from public.listings l
    where l.listing_id = t.listing_id
      and (t.seller_agent_id is null or t.owner_id is null);
  end if;
end $$;

-- Extra safety: delete any remaining self-threads after backfill.
delete from public.threads
where buyer_agent_id is not null
  and seller_agent_id is not null
  and buyer_agent_id = seller_agent_id;

alter table public.threads
  drop constraint if exists threads_listing_id_fkey;

alter table public.threads
  add constraint threads_listing_id_fkey
  foreign key (listing_id) references public.listings(listing_id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'threads_buyer_agent_id_fkey') then
    alter table public.threads
      add constraint threads_buyer_agent_id_fkey
      foreign key (buyer_agent_id) references public.agents(id) on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'threads_seller_agent_id_fkey') then
    alter table public.threads
      add constraint threads_seller_agent_id_fkey
      foreign key (seller_agent_id) references public.agents(id) on delete restrict;
  end if;
end $$;

alter table public.threads
  alter column buyer_agent_id set not null,
  alter column seller_agent_id set not null;

-- Dedupe legacy threads before enforcing UNIQUE (listing_id, buyer_agent_id).
with ranked as (
  select
    t.thread_id,
    first_value(t.thread_id) over (
      partition by t.listing_id, t.buyer_agent_id
      order by t.created_at asc, t.thread_id asc
    ) as keep_thread_id
  from public.threads t
),
dupes as (
  select thread_id, keep_thread_id
  from ranked
  where thread_id <> keep_thread_id
)
update public.messages m
set thread_id = d.keep_thread_id
from dupes d
where m.thread_id = d.thread_id;

-- Also rewrite pending approvals that reference a duplicate thread_id.
with ranked as (
  select
    t.thread_id,
    first_value(t.thread_id) over (
      partition by t.listing_id, t.buyer_agent_id
      order by t.created_at asc, t.thread_id asc
    ) as keep_thread_id
  from public.threads t
),
dupes as (
  select thread_id, keep_thread_id
  from ranked
  where thread_id <> keep_thread_id
)
update public.approvals ap
set action_ref = jsonb_set(
  ap.action_ref,
  '{thread_id}',
  to_jsonb(d.keep_thread_id::text),
  true
)
from dupes d
where ap.state = 'PENDING'
  and ap.action_type = 'message.send'
  and ap.action_ref->>'thread_id' = d.thread_id::text;

with ranked as (
  select
    t.thread_id,
    first_value(t.thread_id) over (
      partition by t.listing_id, t.buyer_agent_id
      order by t.created_at asc, t.thread_id asc
    ) as keep_thread_id
  from public.threads t
),
dupes as (
  select thread_id, keep_thread_id
  from ranked
  where thread_id <> keep_thread_id
)
delete from public.threads t
using dupes d
where t.thread_id = d.thread_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'threads_listing_buyer_unique') then
    alter table public.threads
      add constraint threads_listing_buyer_unique
      unique (listing_id, buyer_agent_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'threads_buyer_seller_distinct') then
    alter table public.threads
      add constraint threads_buyer_seller_distinct
      check (buyer_agent_id <> seller_agent_id);
  end if;
end $$;

create index if not exists threads_listing_id_idx
  on public.threads (listing_id);

create index if not exists threads_buyer_created_idx
  on public.threads (buyer_agent_id, created_at desc, thread_id desc);

create index if not exists threads_seller_created_idx
  on public.threads (seller_agent_id, created_at desc, thread_id desc);

-- MESSAGES
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'message_id'
  ) then
    alter table public.messages rename column id to message_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'message_type'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'type'
  ) then
    alter table public.messages rename column message_type to type;
  end if;
end $$;

alter table public.messages
  -- `payload` is the source of truth in v0; keep legacy `body` as optional.
  alter column body drop not null,
  add column if not exists payload jsonb;

-- Backfill payload from legacy `body` and `type` (or missing type).
update public.messages
set payload = case
  when payload is not null then payload
  when lower(coalesce(type, '')) in ('question', 'answer', 'info') then
    jsonb_build_object('type', coalesce(lower(type), 'info'), 'text', body)
  when lower(coalesce(type, '')) = 'warning' then
    case
      when body is null or body = '' then
        jsonb_build_object(
          'type', 'warning',
          'code', 'external_link_detected',
          'text', 'Avoid external payment links. Use approved flow only.'
        )
      else
        case
          when pg_input_is_valid(body, 'jsonb') then
            case
              -- Legacy system warnings stored JSON objects in body.
              when jsonb_typeof(body::jsonb) = 'object' then
                (body::jsonb || jsonb_build_object('type', 'warning'))
              else
                jsonb_build_object('type', 'warning', 'text', body)
            end
          else
            jsonb_build_object('type', 'warning', 'text', body)
        end
    end
  when type is null or type = '' then
    jsonb_build_object('type', 'info', 'text', body)
  else
    jsonb_build_object('type', lower(type))
end
where payload is null;

-- Normalize payload.type to valid message_type values (fallback to info).
update public.messages
set payload = jsonb_set(
  payload,
  '{type}',
  to_jsonb(
    case
      when lower(nullif(payload->>'type', '')) in (
        'question',
        'answer',
        'info',
        'warning',
        'offer',
        'counter_offer',
        'accept',
        'decline',
        'cancel'
      ) then lower(payload->>'type')
      else 'info'
    end
  ),
  true
)
where payload is not null
  and jsonb_typeof(payload) = 'object';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'sender_id'
      and udt_name <> 'uuid'
  ) then
    alter table public.messages
      alter column sender_id type uuid
      using (
        case
          when sender_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then sender_id::uuid
          else null
        end
      );
  end if;
end $$;

-- Drop legacy defaults before changing enum types (Postgres can't cast defaults automatically).
alter table public.messages
  alter column sender_type drop default;

alter table public.messages
  alter column sender_type type message_sender_type
  using (
    case
      when sender_type = 'agent' then 'agent'::message_sender_type
      when sender_type = 'system' then 'system'::message_sender_type
      when sender_type = 'owner' then 'human'::message_sender_type
      when sender_type = 'human' then 'human'::message_sender_type
      else 'agent'::message_sender_type
    end
  );

alter table public.messages
  alter column sender_type set default 'agent'::message_sender_type;

alter table public.messages
  alter column type type message_type
  using (
    case
      when type is null or type = '' then 'info'
      when lower(type) in (
        'question',
        'answer',
        'info',
        'warning',
        'offer',
        'counter_offer',
        'accept',
        'decline',
        'cancel'
      ) then lower(type)
      else 'info'
    end
  )::message_type;

alter table public.messages
  alter column payload set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_payload_object_check') then
    alter table public.messages
      add constraint messages_payload_object_check
      check (jsonb_typeof(payload) = 'object');
  end if;
end $$;

create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at asc, message_id asc);

create index if not exists messages_type_created_idx
  on public.messages (type, created_at desc);

alter table public.messages
  drop constraint if exists messages_thread_id_fkey;

alter table public.messages
  add constraint messages_thread_id_fkey
  foreign key (thread_id) references public.threads(thread_id) on delete cascade;

-- Updated resolve_approval(): typed payload support for thread.create and message.send
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
