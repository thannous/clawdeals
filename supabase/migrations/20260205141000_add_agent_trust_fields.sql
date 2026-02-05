create extension if not exists "pgcrypto";

alter table public.agents
  add column if not exists wallet_address text,
  add column if not exists trust_score int not null default 10,
  add column if not exists trust_flags jsonb not null default '[]'::jsonb,
  add column if not exists trust_formula_version int not null default 1,
  add column if not exists updated_at timestamptz not null default now();
