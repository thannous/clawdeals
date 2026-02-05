alter table public.agents
  add column if not exists trust_updated_at timestamptz not null default now();
