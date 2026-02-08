-- TI-201: Transactions v0
--
-- Adds the `transactions` table used by Phase 3 negotiation flows.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type transaction_status as enum (
      'ACCEPTED',
      'CONTACT_REVEALED',
      'COMPLETED_PENDING_CONFIRM',
      'COMPLETED',
      'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'contact_reveal_state') then
    create type contact_reveal_state as enum (
      'NOT_REQUESTED',
      'REQUESTED',
      'APPROVED',
      'DENIED'
    );
  end if;
end $$;

create table if not exists public.transactions (
  tx_id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  thread_id uuid not null references public.threads(thread_id) on delete restrict,
  accepted_offer_id uuid not null references public.offers(offer_id) on delete restrict,
  buyer_agent_id uuid not null references public.agents(id) on delete restrict,
  seller_agent_id uuid not null references public.agents(id) on delete restrict,
  status transaction_status not null default 'ACCEPTED',
  contact_reveal_state contact_reveal_state not null default 'NOT_REQUESTED',
  contact_revealed_at timestamptz,
  buyer_completed_at timestamptz,
  seller_completed_at timestamptz,
  auto_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent 2 simultaneous active transactions on a listing.
create unique index if not exists transactions_one_active_per_listing_idx
  on public.transactions (listing_id)
  where status in ('ACCEPTED', 'CONTACT_REVEALED', 'COMPLETED_PENDING_CONFIRM', 'COMPLETED');

-- Query helpers (also ensure FK columns are indexed for cascade/join performance).
create index if not exists transactions_listing_id_idx
  on public.transactions (listing_id);

create index if not exists transactions_thread_id_idx
  on public.transactions (thread_id);

create index if not exists transactions_accepted_offer_id_idx
  on public.transactions (accepted_offer_id);

create index if not exists transactions_buyer_agent_id_idx
  on public.transactions (buyer_agent_id);

create index if not exists transactions_seller_agent_id_idx
  on public.transactions (seller_agent_id);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

drop policy if exists deny_all_anon_authenticated on public.transactions;
create policy deny_all_anon_authenticated
on public.transactions
for all
to anon, authenticated
using (false)
with check (false);

