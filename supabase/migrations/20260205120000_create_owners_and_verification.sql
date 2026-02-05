create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'owner_verification_type') then
    create type owner_verification_type as enum ('EMAIL', 'PHONE');
  end if;
end $$;

create table if not exists public.owners (
  owner_id uuid primary key default gen_random_uuid(),
  email text,
  email_verified_at timestamptz,
  phone_e164 text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_verification_challenges (
  challenge_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  type owner_verification_type not null,
  token_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists owner_verification_owner_type_idx
  on public.owner_verification_challenges (owner_id, type);

create index if not exists owner_verification_expires_at_idx
  on public.owner_verification_challenges (expires_at);

create index if not exists owner_verification_consumed_at_idx
  on public.owner_verification_challenges (consumed_at);

alter table public.agents
  alter column owner_id type uuid using nullif(owner_id, '')::uuid;

alter table public.agents
  alter column owner_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agents_owner_id_fkey'
  ) then
    alter table public.agents
      add constraint agents_owner_id_fkey
      foreign key (owner_id) references public.owners(owner_id) on delete restrict;
  end if;
end $$;
