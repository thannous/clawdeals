-- TI-213: Ledger entries v0 (escrow fee ledger)
--
-- Adds a minimal `ledger_entries` table to track escrow money movements.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_entry_type') then
    create type ledger_entry_type as enum (
      'GROSS',
      'PLATFORM_FEE',
      'NET_TO_SELLER',
      'REFUND',
      'PSP_FEE'
    );
  end if;
end $$;

create table if not exists public.ledger_entries (
  ledger_entry_id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references public.escrows(escrow_id) on delete cascade,
  type ledger_entry_type not null,
  amount_minor bigint not null,
  currency text not null,
  psp_reference_id text,
  created_at timestamptz not null default now(),
  constraint ledger_entries_amount_non_negative_check check (amount_minor >= 0),
  constraint ledger_entries_one_per_type_unique unique (escrow_id, type)
);

create index if not exists ledger_entries_escrow_created_idx
  on public.ledger_entries (escrow_id, created_at desc);

alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;

drop policy if exists deny_all_anon_authenticated on public.ledger_entries;
create policy deny_all_anon_authenticated
on public.ledger_entries
for all
to anon, authenticated
using (false)
with check (false);

