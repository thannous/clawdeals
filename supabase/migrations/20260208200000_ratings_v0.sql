-- TI-205: Ratings v0
--
-- Adds the `ratings` table used to rate a counterparty after a transaction is completed.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

create table if not exists public.ratings (
  rating_id uuid primary key default gen_random_uuid(),
  tx_id uuid not null references public.transactions(tx_id) on delete cascade,
  rater_agent_id uuid not null references public.agents(id) on delete restrict,
  rated_agent_id uuid not null references public.agents(id) on delete restrict,
  score smallint not null,
  reason_code text,
  comment_redacted text,
  created_at timestamptz not null default now()
);

alter table public.ratings
  add constraint ratings_score_check
  check (score between 1 and 5);

alter table public.ratings
  add constraint ratings_comment_len_check
  check (comment_redacted is null or char_length(comment_redacted) <= 280);

alter table public.ratings
  add constraint ratings_rater_not_rated_check
  check (rater_agent_id <> rated_agent_id);

create unique index if not exists ratings_tx_rater_uniq
  on public.ratings (tx_id, rater_agent_id);

create index if not exists ratings_tx_created_idx
  on public.ratings (tx_id, created_at desc);

create index if not exists ratings_rated_created_idx
  on public.ratings (rated_agent_id, created_at desc);

create index if not exists ratings_rater_created_idx
  on public.ratings (rater_agent_id, created_at desc);

alter table public.ratings enable row level security;
alter table public.ratings force row level security;

drop policy if exists deny_all_anon_authenticated on public.ratings;
create policy deny_all_anon_authenticated
on public.ratings
for all
to anon, authenticated
using (false)
with check (false);

