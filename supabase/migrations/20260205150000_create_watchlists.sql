create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  locale text,
  source text
);

create unique index if not exists watchlists_email_key on public.watchlists (email);

alter table public.watchlists enable row level security;
alter table public.watchlists force row level security;
