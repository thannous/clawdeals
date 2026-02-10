-- TI-309: Connect sessions v0 (claim link engine).
--
-- Security posture: direct PostgREST access via `anon`/`authenticated` is denied.
-- Tokens (poll/claim/verification_code) are never stored in plaintext, only as hashes.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'connect_session_status') then
    create type connect_session_status as enum (
      'PENDING_CLAIM',
      'CLAIMED',
      'DELIVERED',
      'EXPIRED',
      'CANCELLED'
    );
  end if;
end $$;

create table if not exists public.connect_sessions (
  session_id uuid primary key default gen_random_uuid(),
  status connect_session_status not null default 'PENDING_CLAIM',
  requested_agent_name text not null,
  requested_scopes text[] not null default '{}'::text[],
  client_type text not null default 'other',
  client_version text,
  poll_token_hash text not null unique,
  claim_token_hash text not null unique,
  verification_code_hash text not null,
  owner_id uuid references public.owners(owner_id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  installation_id uuid,
  ip_truncated inet,
  ua_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  expires_at timestamptz not null,
  constraint connect_sessions_requested_agent_name_length_check check (char_length(requested_agent_name) between 1 and 80),
  constraint connect_sessions_expires_after_created_check check (expires_at > created_at),
  constraint connect_sessions_claimed_after_created_check check (claimed_at is null or claimed_at >= created_at),
  constraint connect_sessions_delivered_after_created_check check (delivered_at is null or delivered_at >= created_at),
  constraint connect_sessions_cancelled_after_created_check check (cancelled_at is null or cancelled_at >= created_at),
  constraint connect_sessions_expired_after_created_check check (expired_at is null or expired_at >= created_at)
);

create index if not exists connect_sessions_status_created_idx
  on public.connect_sessions (status, created_at desc, session_id desc);

create index if not exists connect_sessions_expires_at_idx
  on public.connect_sessions (expires_at asc, session_id asc);

create index if not exists connect_sessions_owner_created_idx
  on public.connect_sessions (owner_id, created_at desc, session_id desc)
  where owner_id is not null;

create index if not exists connect_sessions_verification_code_hash_idx
  on public.connect_sessions (verification_code_hash);

alter table public.connect_sessions enable row level security;
alter table public.connect_sessions force row level security;

drop policy if exists deny_all_anon_authenticated on public.connect_sessions;
create policy deny_all_anon_authenticated
on public.connect_sessions
for all
to anon, authenticated
using (false)
with check (false);
