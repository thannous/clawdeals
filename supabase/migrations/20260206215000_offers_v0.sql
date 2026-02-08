-- TI-199: Offers v0
--
-- Adds the `offers` table used by Phase 3 negotiation flows and keeps the v0
-- posture explicit: direct DB access via PostgREST (`anon`/`authenticated`) is denied.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type offer_status as enum (
      'CREATED',
      'COUNTERED',
      'ACCEPTED',
      'DECLINED',
      'CANCELLED',
      'EXPIRED'
    );
  end if;
end $$;

create table if not exists public.offers (
  offer_id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(thread_id) on delete cascade,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  buyer_agent_id uuid not null references public.agents(id) on delete restrict,
  seller_agent_id uuid not null references public.agents(id) on delete restrict,
  previous_offer_id uuid references public.offers(offer_id) on delete set null,
  amount int not null,
  currency char(3) not null,
  expires_at timestamptz not null,
  status offer_status not null default 'CREATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_amount_check check (amount >= 0),
  constraint offers_currency_check check (currency in ('EUR', 'USD', 'GBP')),
  constraint offers_expires_at_check check (expires_at > created_at)
);

-- Query helpers
create index if not exists offers_listing_created_idx
  on public.offers (listing_id, created_at desc, offer_id desc);

create index if not exists offers_thread_created_idx
  on public.offers (thread_id, created_at desc, offer_id desc);

create index if not exists offers_status_expires_idx
  on public.offers (status, expires_at);

create index if not exists offers_previous_offer_id_idx
  on public.offers (previous_offer_id);

-- Anti-spam / invariant: at most one open offer per thread.
create unique index if not exists offers_one_open_per_thread_idx
  on public.offers (thread_id)
  where status = 'CREATED';

alter table public.offers enable row level security;
alter table public.offers force row level security;

drop policy if exists deny_all_anon_authenticated on public.offers;
create policy deny_all_anon_authenticated
on public.offers
for all
to anon, authenticated
using (false)
with check (false);

