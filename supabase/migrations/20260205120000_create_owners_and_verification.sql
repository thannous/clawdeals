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

with invalid_owner_ids as (
  select id as agent_id, gen_random_uuid() as owner_uuid
  from public.agents
  where owner_id is not null
    and owner_id <> ''
    and owner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
missing_owner_ids as (
  select id as agent_id, gen_random_uuid() as owner_uuid
  from public.agents
  where owner_id is null or owner_id = ''
),
insert_existing as (
  insert into public.owners (owner_id, created_at, updated_at)
  select distinct owner_id::uuid, now(), now()
  from public.agents
  where owner_id is not null
    and owner_id <> ''
    and owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  on conflict do nothing
),
insert_invalid as (
  insert into public.owners (owner_id, created_at, updated_at)
  select owner_uuid, now(), now()
  from invalid_owner_ids
  on conflict do nothing
),
insert_missing as (
  insert into public.owners (owner_id, created_at, updated_at)
  select owner_uuid, now(), now()
  from missing_owner_ids
  on conflict do nothing
)
update public.agents
set owner_id = coalesce(invalid_owner_ids.owner_uuid, missing_owner_ids.owner_uuid)::text
from invalid_owner_ids
full join missing_owner_ids on missing_owner_ids.agent_id = invalid_owner_ids.agent_id
where public.agents.id = coalesce(invalid_owner_ids.agent_id, missing_owner_ids.agent_id);

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
