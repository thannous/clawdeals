-- TI-296: Pairing tokens (Telegram-first pairing wizard).
-- One-time tokens (TTL 10 min) used for:
-- - Web -> Telegram deep-link: t.me/<bot>?start=<pair_token>
-- - Telegram -> Web confirm: /pair?token=<pair_token>

create extension if not exists "pgcrypto";

create table if not exists public.pairing_tokens (
  pairing_token_id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  token_type text not null,
  owner_id uuid references public.owners(owner_id) on delete cascade,
  channel_type channel_type_enum not null,
  channel_user_id text,
  channel_context_id text not null default '',
  display_name text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint pairing_tokens_token_type_check check (token_type in ('WEB_TO_CHANNEL', 'CHANNEL_TO_WEB')),
  constraint pairing_tokens_web_to_channel_owner_check check (token_type <> 'WEB_TO_CHANNEL' or owner_id is not null),
  constraint pairing_tokens_channel_to_web_user_check check (token_type <> 'CHANNEL_TO_WEB' or channel_user_id is not null),
  constraint pairing_tokens_expires_after_created_check check (expires_at > created_at),
  constraint pairing_tokens_attempts_nonnegative_check check (attempts_count >= 0),
  constraint pairing_tokens_consumed_after_created_check check (consumed_at is null or consumed_at >= created_at)
);

create index if not exists pairing_tokens_owner_type_created_idx
  on public.pairing_tokens (owner_id, token_type, created_at desc, pairing_token_id desc);

create index if not exists pairing_tokens_channel_lookup_idx
  on public.pairing_tokens (channel_type, channel_user_id, channel_context_id, token_type, created_at desc);

alter table public.pairing_tokens enable row level security;

drop policy if exists deny_all_anon_authenticated on public.pairing_tokens;
create policy deny_all_anon_authenticated
on public.pairing_tokens
for all
to anon, authenticated
using (false)
with check (false);

