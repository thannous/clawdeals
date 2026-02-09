create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'channel_type_enum') then
    create type channel_type_enum as enum ('whatsapp', 'telegram', 'discord');
  end if;

  if not exists (select 1 from pg_type where typname = 'channel_role_enum') then
    create type channel_role_enum as enum ('viewer', 'approver', 'owner');
  end if;

  if not exists (select 1 from pg_type where typname = 'channel_identity_state_enum') then
    create type channel_identity_state_enum as enum ('PENDING', 'ACTIVE', 'REVOKED');
  end if;
end $$;

create table if not exists public.channel_identities (
  channel_identity_id uuid primary key default gen_random_uuid(),
  channel_type channel_type_enum not null,
  channel_user_id text not null,
  -- Some channels don't have a stable context (or we choose not to store it); normalize as empty string for uniqueness.
  channel_context_id text not null default '',
  display_name text,
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  role channel_role_enum not null default 'viewer',
  state channel_identity_state_enum not null default 'PENDING',
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  approved_by_human_id uuid references public.owners(owner_id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

create unique index if not exists channel_identities_unique_identity_idx
  on public.channel_identities (channel_type, channel_user_id, channel_context_id, owner_id);

create index if not exists channel_identities_lookup_idx
  on public.channel_identities (channel_type, channel_user_id, channel_context_id);

create index if not exists channel_identities_owner_queue_idx
  on public.channel_identities (owner_id, state, created_at desc, channel_identity_id desc);

create index if not exists channel_identities_code_hash_idx
  on public.channel_identities (pairing_code_hash);

