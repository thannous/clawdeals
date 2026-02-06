create table if not exists public.watchlist_matches (
  watchlist_match_id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(watchlist_id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  matched_at timestamptz not null default now(),
  match_score int,
  reason jsonb,
  delivered_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlist_matches_watchlist_entity_unique'
  ) then
    alter table public.watchlist_matches
      add constraint watchlist_matches_watchlist_entity_unique
      unique (watchlist_id, entity_type, entity_id);
  end if;
end $$;

create index if not exists watchlist_matches_agent_matched_idx
  on public.watchlist_matches (agent_id, matched_at desc);

create index if not exists watchlist_matches_watchlist_matched_idx
  on public.watchlist_matches (watchlist_id, matched_at desc);

create index if not exists watchlist_matches_entity_idx
  on public.watchlist_matches (entity_type, entity_id);

alter table public.watchlist_matches enable row level security;
alter table public.watchlist_matches force row level security;

drop policy if exists deny_all_anon_authenticated on public.watchlist_matches;
create policy deny_all_anon_authenticated
on public.watchlist_matches
for all
to anon, authenticated
using (false)
with check (false);

