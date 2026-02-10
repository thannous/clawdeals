-- TI-312: OAuth device authorizations v0 (RFC 8628 device_code).
--
-- Security posture: direct PostgREST access via `anon`/`authenticated` is denied.
-- device_code and user_code are never stored in plaintext, only as hashes.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'oauth_device_authorization_status') then
    create type oauth_device_authorization_status as enum (
      'PENDING',
      'AUTHORIZED',
      'DENIED',
      'EXPIRED'
    );
  end if;
end $$;

create table if not exists public.oauth_device_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  status oauth_device_authorization_status not null default 'PENDING',
  client_id text not null,
  requested_scopes text[] not null default '{}'::text[],
  requested_agent_name text,
  device_code_hash text not null unique,
  user_code_hash text not null unique,
  owner_id uuid references public.owners(owner_id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  ip_truncated inet,
  ua_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  authorized_at timestamptz,
  denied_at timestamptz,
  expired_at timestamptz,
  expires_at timestamptz not null,
  constraint oauth_device_authorizations_client_id_length_check check (char_length(client_id) between 1 and 80),
  constraint oauth_device_authorizations_requested_agent_name_length_check check (
    requested_agent_name is null or char_length(requested_agent_name) between 1 and 80
  ),
  constraint oauth_device_authorizations_expires_after_created_check check (expires_at > created_at),
  constraint oauth_device_authorizations_authorized_after_created_check check (authorized_at is null or authorized_at >= created_at),
  constraint oauth_device_authorizations_denied_after_created_check check (denied_at is null or denied_at >= created_at),
  constraint oauth_device_authorizations_expired_after_created_check check (expired_at is null or expired_at >= created_at)
);

create index if not exists oauth_device_authorizations_status_created_idx
  on public.oauth_device_authorizations (status, created_at desc, authorization_id desc);

create index if not exists oauth_device_authorizations_expires_at_idx
  on public.oauth_device_authorizations (expires_at asc, authorization_id asc);

create index if not exists oauth_device_authorizations_owner_created_idx
  on public.oauth_device_authorizations (owner_id, created_at desc, authorization_id desc)
  where owner_id is not null;

alter table public.oauth_device_authorizations enable row level security;
alter table public.oauth_device_authorizations force row level security;

drop policy if exists deny_all_anon_authenticated on public.oauth_device_authorizations;
create policy deny_all_anon_authenticated
on public.oauth_device_authorizations
for all
to anon, authenticated
using (false)
with check (false);

