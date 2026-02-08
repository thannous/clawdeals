-- TI-210: PSP integration setup (mock PSP v0)
--
-- Adds PSP configuration, seller PSP accounts, and webhook event dedupe store.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'psp_kyc_status') then
    create type psp_kyc_status as enum ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');
  end if;

  if not exists (select 1 from pg_type where typname = 'psp_webhook_event_status') then
    create type psp_webhook_event_status as enum ('RECEIVED', 'APPLIED', 'PENDING_RETRY', 'FAILED');
  end if;
end $$;

-- PSP config (singleton)
create table if not exists public.psp_config (
  psp_config_id uuid primary key default gen_random_uuid(),
  singleton_key text not null default 'psp_config_v0',
  provider text not null,
  mode text not null,
  webhook_secret_ref text not null,
  platform_fee_bps_default int not null default 400,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psp_config_singleton_key_unique unique (singleton_key),
  constraint psp_config_provider_check check (provider in ('mock')),
  constraint psp_config_mode_check check (mode in ('sandbox', 'production')),
  constraint psp_config_platform_fee_bps_default_check check (platform_fee_bps_default >= 0 and platform_fee_bps_default <= 2000)
);

alter table public.psp_config enable row level security;
alter table public.psp_config force row level security;

drop policy if exists deny_all_anon_authenticated on public.psp_config;
create policy deny_all_anon_authenticated
on public.psp_config
for all
to anon, authenticated
using (false)
with check (false);

-- Seller PSP accounts (one per owner in v0)
create table if not exists public.psp_accounts (
  psp_account_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  psp_provider text not null,
  psp_external_account_id text not null,
  kyc_status psp_kyc_status not null default 'NOT_STARTED',
  requirements_due jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psp_accounts_provider_check check (psp_provider in ('mock'))
);

create unique index if not exists psp_accounts_owner_unique_idx
  on public.psp_accounts (owner_id);

create unique index if not exists psp_accounts_external_unique_idx
  on public.psp_accounts (psp_provider, psp_external_account_id);

alter table public.psp_accounts enable row level security;
alter table public.psp_accounts force row level security;

drop policy if exists deny_all_anon_authenticated on public.psp_accounts;
create policy deny_all_anon_authenticated
on public.psp_accounts
for all
to anon, authenticated
using (false)
with check (false);

-- Webhook event store (dedupe + retries)
create table if not exists public.psp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  psp_provider text not null,
  psp_event_id text not null,
  type text not null,
  status psp_webhook_event_status not null default 'RECEIVED',
  escrow_id uuid,
  psp_external_account_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint psp_webhook_events_provider_check check (psp_provider in ('mock'))
);

create unique index if not exists psp_webhook_events_provider_event_unique_idx
  on public.psp_webhook_events (psp_provider, psp_event_id);

create index if not exists psp_webhook_events_status_received_idx
  on public.psp_webhook_events (status, received_at);

alter table public.psp_webhook_events enable row level security;
alter table public.psp_webhook_events force row level security;

drop policy if exists deny_all_anon_authenticated on public.psp_webhook_events;
create policy deny_all_anon_authenticated
on public.psp_webhook_events
for all
to anon, authenticated
using (false)
with check (false);

