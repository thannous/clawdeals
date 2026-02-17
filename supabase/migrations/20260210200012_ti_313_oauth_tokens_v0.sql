-- TI-313: OAuth token issuance + refresh + revoke (RFC 7009) v0.
--
-- Security posture: direct PostgREST access via `anon`/`authenticated` is denied.
-- Tokens are stored hashed (HMAC) and never in plaintext.

create extension if not exists "pgcrypto";

create table if not exists public.oauth_refresh_tokens (
  token_id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  installation_id uuid not null references public.agent_installations(installation_id) on delete cascade,
  scopes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_from_token_id uuid references public.oauth_refresh_tokens(token_id) on delete set null,
  constraint oauth_refresh_tokens_expires_after_created_check check (expires_at > created_at),
  constraint oauth_refresh_tokens_revoked_after_created_check check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists oauth_refresh_tokens_owner_created_idx
  on public.oauth_refresh_tokens (owner_id, created_at desc, token_id desc);

create index if not exists oauth_refresh_tokens_installation_created_idx
  on public.oauth_refresh_tokens (installation_id, created_at desc, token_id desc);

create index if not exists oauth_refresh_tokens_expires_at_idx
  on public.oauth_refresh_tokens (expires_at asc, token_id asc);

create index if not exists oauth_refresh_tokens_installation_active_idx
  on public.oauth_refresh_tokens (installation_id)
  where revoked_at is null;

alter table public.oauth_refresh_tokens enable row level security;
alter table public.oauth_refresh_tokens force row level security;

drop policy if exists deny_all_anon_authenticated on public.oauth_refresh_tokens;
create policy deny_all_anon_authenticated
on public.oauth_refresh_tokens
for all
to anon, authenticated
using (false)
with check (false);

alter table public.oauth_device_authorizations
  add column if not exists exchanged_at timestamptz;

