create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'api_key_state') then
    create type api_key_state as enum ('ACTIVE', 'GRACE', 'REVOKED');
  end if;
end $$;

create table if not exists public.api_keys (
  api_key_id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null,
  scope text not null default 'full',
  key_state api_key_state not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  grace_expires_at timestamptz
);

create unique index if not exists api_keys_key_prefix_unique on public.api_keys (key_prefix);
create index if not exists api_keys_agent_id_idx on public.api_keys (agent_id);
create index if not exists api_keys_state_idx on public.api_keys (key_state);

create unique index if not exists api_keys_active_unique
  on public.api_keys (agent_id)
  where key_state = 'ACTIVE';

create unique index if not exists api_keys_grace_unique
  on public.api_keys (agent_id)
  where key_state = 'GRACE';

alter table public.api_keys enable row level security;
alter table public.api_keys force row level security;
