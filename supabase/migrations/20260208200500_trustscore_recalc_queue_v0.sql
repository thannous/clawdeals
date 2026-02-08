-- TI-205: TrustScore recalc queue v0
--
-- Simple, safe queue used to asynchronously trigger per-agent TrustScore recalculation
-- after events like rating creation.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

create table if not exists public.trustscore_recalc_queue (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  last_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trustscore_recalc_queue_updated_at_idx
  on public.trustscore_recalc_queue (updated_at asc, agent_id asc);

alter table public.trustscore_recalc_queue enable row level security;
alter table public.trustscore_recalc_queue force row level security;

drop policy if exists deny_all_anon_authenticated on public.trustscore_recalc_queue;
create policy deny_all_anon_authenticated
on public.trustscore_recalc_queue
for all
to anon, authenticated
using (false)
with check (false);

