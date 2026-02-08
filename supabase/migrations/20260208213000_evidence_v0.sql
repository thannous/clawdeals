-- TI-214: Evidence pack minimal (proofs, hashes, logs) v0
--
-- Adds disputes anchor table (minimal for Phase 4) and evidence pack tables.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

create table if not exists public.disputes (
  dispute_id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references public.escrows(escrow_id) on delete cascade,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disputes_one_per_escrow_unique unique (escrow_id)
);

alter table public.disputes enable row level security;
alter table public.disputes force row level security;

drop policy if exists deny_all_anon_authenticated on public.disputes;
create policy deny_all_anon_authenticated
on public.disputes
for all
to anon, authenticated
using (false)
with check (false);

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_submitted_by') then
    create type evidence_submitted_by as enum ('BUYER', 'SELLER', 'OPS');
  end if;

  if not exists (select 1 from pg_type where typname = 'evidence_link_type') then
    create type evidence_link_type as enum ('AUDIT_LOG', 'THREAD_MESSAGE', 'OFFER', 'TRANSACTION', 'ESCROW');
  end if;
end $$;

create table if not exists public.evidence_packs (
  evidence_pack_id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(dispute_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint evidence_packs_dispute_unique unique (dispute_id)
);

alter table public.evidence_packs enable row level security;
alter table public.evidence_packs force row level security;

drop policy if exists deny_all_anon_authenticated on public.evidence_packs;
create policy deny_all_anon_authenticated
on public.evidence_packs
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.evidence_items (
  evidence_item_id uuid primary key default gen_random_uuid(),
  evidence_pack_id uuid not null references public.evidence_packs(evidence_pack_id) on delete cascade,
  submitted_by evidence_submitted_by not null,
  storage_bucket text not null,
  storage_key text not null,
  content_type text not null,
  bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  constraint evidence_items_bytes_check check (bytes > 0),
  constraint evidence_items_sha256_len_check check (char_length(sha256) = 64)
);

create index if not exists evidence_items_pack_created_idx
  on public.evidence_items (evidence_pack_id, created_at desc);

alter table public.evidence_items enable row level security;
alter table public.evidence_items force row level security;

drop policy if exists deny_all_anon_authenticated on public.evidence_items;
create policy deny_all_anon_authenticated
on public.evidence_items
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.evidence_links (
  evidence_link_id uuid primary key default gen_random_uuid(),
  evidence_pack_id uuid not null references public.evidence_packs(evidence_pack_id) on delete cascade,
  link_type evidence_link_type not null,
  link_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists evidence_links_pack_created_idx
  on public.evidence_links (evidence_pack_id, created_at desc);

alter table public.evidence_links enable row level security;
alter table public.evidence_links force row level security;

drop policy if exists deny_all_anon_authenticated on public.evidence_links;
create policy deny_all_anon_authenticated
on public.evidence_links
for all
to anon, authenticated
using (false)
with check (false);

