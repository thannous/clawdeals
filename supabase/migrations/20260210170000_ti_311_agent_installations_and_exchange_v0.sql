-- TI-311: Connect session exchange -> per-installation API key (AgentPassport).
--
-- Adds:
-- - `agent_installations` (one installation per client install; revocable)
-- - `api_keys.installation_id` to scope keys per installation
-- - RPC `connect_session_exchange_v1` to atomically deliver an API key once
--
-- v0 posture: called from backend using service role; direct PostgREST access is denied.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_installation_status') then
    create type agent_installation_status as enum (
      'ACTIVE',
      'REVOKED'
    );
  end if;
end $$;

create table if not exists public.agent_installations (
  installation_id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.owners(owner_id) on delete set null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  client_type text not null default 'other',
  client_version text,
  device_name text,
  fingerprint_hash text,
  status agent_installation_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists agent_installations_agent_id_idx
  on public.agent_installations (agent_id);

create index if not exists agent_installations_owner_id_idx
  on public.agent_installations (owner_id)
  where owner_id is not null;

create index if not exists agent_installations_last_seen_at_idx
  on public.agent_installations (last_seen_at desc, installation_id desc);

alter table public.agent_installations enable row level security;
alter table public.agent_installations force row level security;

drop policy if exists deny_all_anon_authenticated on public.agent_installations;
create policy deny_all_anon_authenticated
on public.agent_installations
for all
to anon, authenticated
using (false)
with check (false);

-- api_keys: associate keys with an installation for fine-grained revocation.
alter table public.api_keys
  add column if not exists installation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_installation_id_fkey'
  ) then
    alter table public.api_keys
      add constraint api_keys_installation_id_fkey
      foreign key (installation_id) references public.agent_installations(installation_id) on delete set null;
  end if;
end $$;

create index if not exists api_keys_installation_id_idx
  on public.api_keys (installation_id)
  where installation_id is not null;

create index if not exists api_keys_agent_installation_id_idx
  on public.api_keys (agent_id, installation_id);

-- Replace "1 ACTIVE key per agent" invariant with:
-- - 1 ACTIVE/GRACE key per (agent_id, installation_id) when installation_id is set
-- - 1 ACTIVE/GRACE "global" key per agent when installation_id is null (legacy behavior)
drop index if exists api_keys_active_unique;
drop index if exists api_keys_grace_unique;

create unique index if not exists api_keys_active_global_unique
  on public.api_keys (agent_id)
  where key_state = 'ACTIVE' and installation_id is null;

create unique index if not exists api_keys_grace_global_unique
  on public.api_keys (agent_id)
  where key_state = 'GRACE' and installation_id is null;

create unique index if not exists api_keys_active_installation_unique
  on public.api_keys (agent_id, installation_id)
  where key_state = 'ACTIVE' and installation_id is not null;

create unique index if not exists api_keys_grace_installation_unique
  on public.api_keys (agent_id, installation_id)
  where key_state = 'GRACE' and installation_id is not null;

-- Optional FK: connect_sessions.installation_id -> agent_installations.installation_id
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'connect_sessions_installation_id_fkey'
  ) then
    alter table public.connect_sessions
      add constraint connect_sessions_installation_id_fkey
      foreign key (installation_id) references public.agent_installations(installation_id) on delete set null;
  end if;
end $$;

create or replace function public.connect_session_exchange_v1(
  p_session_id uuid,
  p_poll_token_hash text,
  p_requested_scope text,
  p_client_type text,
  p_client_version text,
  p_device_name text,
  p_fingerprint text,
  p_key_prefix text,
  p_key_hash text,
  p_now timestamptz
)
returns table (
  session_id uuid,
  status connect_session_status,
  agent_id uuid,
  owner_id uuid,
  installation_id uuid,
  api_key_id uuid,
  issued_at timestamptz
)
language plpgsql
as $$
declare
  session_row public.connect_sessions%rowtype;
  installation_row public.agent_installations%rowtype;
  api_key_row public.api_keys%rowtype;
  v_now timestamptz := coalesce(p_now, now());
  v_requested_scope text;
  v_client_type text;
  v_client_version text;
  v_device_name text;
  v_fingerprint_hash text;
begin
  v_requested_scope := lower(coalesce(nullif(btrim(p_requested_scope), ''), ''));
  if v_requested_scope = '' then
    raise exception 'VALIDATION_ERROR:REQUESTED_KEY_SCOPE';
  end if;

  if p_session_id is null then
    raise exception 'VALIDATION_ERROR:SESSION_ID';
  end if;

  if p_poll_token_hash is null or nullif(btrim(p_poll_token_hash), '') is null then
    raise exception 'VALIDATION_ERROR:POLL_TOKEN';
  end if;

  if p_key_prefix is null or nullif(btrim(p_key_prefix), '') is null then
    raise exception 'VALIDATION_ERROR:KEY_PREFIX';
  end if;

  if p_key_hash is null or nullif(btrim(p_key_hash), '') is null then
    raise exception 'VALIDATION_ERROR:KEY_HASH';
  end if;

  select *
    into session_row
    from public.connect_sessions s
   where s.session_id = p_session_id
   for update;

  if not found then
    raise exception 'CONNECT_SESSION_NOT_FOUND';
  end if;

  if session_row.poll_token_hash is distinct from p_poll_token_hash then
    raise exception 'CONNECT_POLL_TOKEN_INVALID';
  end if;

  -- Expire sessions once past expires_at (including CLAIMED-but-not-delivered).
  if session_row.expires_at <= v_now then
    if session_row.status in ('PENDING_CLAIM', 'CLAIMED') then
      update public.connect_sessions
         set status = 'EXPIRED',
             expired_at = coalesce(session_row.expired_at, v_now),
             updated_at = v_now
       where session_id = session_row.session_id;
    end if;
    raise exception 'SESSION_EXPIRED';
  end if;

  if session_row.status = 'DELIVERED' then
    raise exception 'SESSION_ALREADY_DELIVERED';
  end if;

  if session_row.status <> 'CLAIMED' then
    raise exception 'SESSION_NOT_CLAIMED';
  end if;

  if session_row.agent_id is null then
    raise exception 'CONNECT_SESSION_MISSING_AGENT';
  end if;

  v_client_type := lower(coalesce(nullif(btrim(p_client_type), ''), 'other'));
  v_client_type := left(v_client_type, 40);
  v_client_version := nullif(left(coalesce(p_client_version, ''), 40), '');
  v_device_name := nullif(left(coalesce(p_device_name, ''), 80), '');

  if p_fingerprint is not null and nullif(btrim(p_fingerprint), '') is not null then
    v_fingerprint_hash := encode(digest(p_fingerprint, 'sha256'), 'hex');
  else
    v_fingerprint_hash := null;
  end if;

  insert into public.agent_installations (
    owner_id,
    agent_id,
    client_type,
    client_version,
    device_name,
    fingerprint_hash,
    status,
    created_at,
    last_seen_at
  )
  values (
    session_row.owner_id,
    session_row.agent_id,
    v_client_type,
    v_client_version,
    v_device_name,
    v_fingerprint_hash,
    'ACTIVE'::agent_installation_status,
    v_now,
    v_now
  )
  returning * into installation_row;

  insert into public.api_keys (
    agent_id,
    installation_id,
    key_prefix,
    key_hash,
    scope,
    key_state,
    created_at,
    revoked_at,
    grace_expires_at
  )
  values (
    session_row.agent_id,
    installation_row.installation_id,
    btrim(p_key_prefix),
    btrim(p_key_hash),
    v_requested_scope,
    'ACTIVE',
    v_now,
    null,
    null
  )
  returning * into api_key_row;

  update public.connect_sessions
     set status = 'DELIVERED',
         installation_id = installation_row.installation_id,
         delivered_at = v_now,
         updated_at = v_now
   where session_id = session_row.session_id;

  return query
    select session_row.session_id,
           'DELIVERED'::connect_session_status,
           session_row.agent_id,
           session_row.owner_id,
           installation_row.installation_id,
           api_key_row.api_key_id,
           v_now;
end;
$$;
