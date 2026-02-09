-- TI-272: Watchlists v1 backfill queue v0
--
-- Simple queue table used to backfill watchlist matches on create.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists pgcrypto;

create table if not exists public.watchlist_backfill_queue (
  watchlist_id uuid primary key references public.watchlists(watchlist_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_backfill_queue_updated_at_idx
  on public.watchlist_backfill_queue (updated_at asc, watchlist_id asc);

alter table public.watchlist_backfill_queue enable row level security;
alter table public.watchlist_backfill_queue force row level security;

drop policy if exists deny_all_anon_authenticated on public.watchlist_backfill_queue;
create policy deny_all_anon_authenticated
on public.watchlist_backfill_queue
for all
to anon, authenticated
using (false)
with check (false);

