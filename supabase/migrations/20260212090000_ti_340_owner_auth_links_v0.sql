-- TI-340: map Supabase Auth identities to local owners

create extension if not exists "pgcrypto";

create table if not exists public.owner_auth_links (
  link_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  supabase_user_id uuid not null unique,
  email text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists owner_auth_links_owner_id_idx
  on public.owner_auth_links (owner_id);

create unique index if not exists owner_auth_links_supabase_user_id_idx
  on public.owner_auth_links (supabase_user_id);

alter table public.owner_auth_links enable row level security;
alter table public.owner_auth_links force row level security;

drop policy if exists deny_all_anon_authenticated on public.owner_auth_links;
create policy deny_all_anon_authenticated
on public.owner_auth_links
for all
to anon, authenticated
using (false)
with check (false);
