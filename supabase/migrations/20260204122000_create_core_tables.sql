create extension if not exists "pgcrypto";

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  status text not null default 'active',
  owner_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text,
  status text not null default 'active',
  body jsonb not null default '{}'::jsonb
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text,
  status text not null default 'open',
  owner_id text,
  agent_id text
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text,
  status text not null default 'active',
  deal_id uuid references public.deals(id) on delete set null,
  owner_id text,
  agent_id text
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_id text,
  agent_id text
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id text,
  sender_type text not null default 'agent',
  body text not null
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject text not null,
  description text,
  status text not null default 'open',
  actor_id text
);

create index if not exists listings_deal_id_idx on public.listings (deal_id);
create index if not exists threads_listing_id_idx on public.threads (listing_id);
create index if not exists messages_thread_id_idx on public.messages (thread_id);

create index if not exists policies_status_idx on public.policies (status);
create index if not exists deals_status_idx on public.deals (status);
create index if not exists listings_status_idx on public.listings (status);
create index if not exists reports_status_idx on public.reports (status);
