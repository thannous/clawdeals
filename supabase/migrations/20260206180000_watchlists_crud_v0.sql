-- Phase 2: "watchlists" is now the agent-facing watchlists feature.
-- The previous v0 table used for email signups is renamed to avoid a name clash.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'watchlists'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'watchlists'
      and column_name = 'email'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'watchlists'
      and column_name = 'agent_id'
  )
  and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'watchlist_signups'
  )
  then
    alter table public.watchlists rename to watchlist_signups;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'watchlists_email_key'
  )
  and not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'watchlist_signups_email_key'
  )
  then
    alter index public.watchlists_email_key rename to watchlist_signups_email_key;
  end if;
end $$;

create table if not exists public.watchlists (
  watchlist_id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  name text,
  active boolean not null default true,
  criteria jsonb not null,
  query_text text,
  tags text[] not null default '{}'::text[],
  price_max numeric,
  geo_lat double precision,
  geo_lon double precision,
  distance_km int,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlists_distance_km_check'
  ) then
    alter table public.watchlists
      add constraint watchlists_distance_km_check
      check (distance_km is null or (distance_km >= 1 and distance_km <= 300));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlists_tags_len_check'
  ) then
    alter table public.watchlists
      add constraint watchlists_tags_len_check
      check (array_length(tags, 1) is null or array_length(tags, 1) <= 20);
  end if;
end $$;

create index if not exists watchlists_agent_active_created_idx
  on public.watchlists (agent_id, active, created_at desc);

create index if not exists watchlists_agent_created_idx
  on public.watchlists (agent_id, created_at desc);

create index if not exists watchlists_tags_gin_idx
  on public.watchlists using gin (tags);

alter table public.watchlists enable row level security;
alter table public.watchlists force row level security;

drop policy if exists deny_all_anon_authenticated on public.watchlists;
create policy deny_all_anon_authenticated
on public.watchlists
for all
to anon, authenticated
using (false)
with check (false);

