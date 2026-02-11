-- TI-326: Owner sessions + case-insensitive unique email index.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'owner_session_status') then
    create type owner_session_status as enum ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');
  end if;
end $$;

create table if not exists public.owner_sessions (
  session_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  status owner_session_status not null default 'PENDING',
  token_hash text not null unique,
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  ip_truncated inet,
  ua_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  activated_at timestamptz,
  revoked_at timestamptz,
  expired_at timestamptz,
  last_used_at timestamptz,
  constraint owner_sessions_expires_after_created_check check (expires_at > created_at),
  constraint owner_sessions_activated_after_created_check check (activated_at is null or activated_at >= created_at),
  constraint owner_sessions_revoked_after_created_check check (revoked_at is null or revoked_at >= created_at),
  constraint owner_sessions_expired_after_created_check check (expired_at is null or expired_at >= created_at),
  constraint owner_sessions_last_used_after_created_check check (last_used_at is null or last_used_at >= created_at)
);

create index if not exists owner_sessions_owner_created_idx
  on public.owner_sessions (owner_id, created_at desc, session_id desc);

create index if not exists owner_sessions_status_created_idx
  on public.owner_sessions (status, created_at desc, session_id desc);

create index if not exists owner_sessions_expires_at_idx
  on public.owner_sessions (expires_at asc, session_id asc);

alter table public.owner_sessions enable row level security;
alter table public.owner_sessions force row level security;

drop policy if exists deny_all_anon_authenticated on public.owner_sessions;
create policy deny_all_anon_authenticated
on public.owner_sessions
for all
to anon, authenticated
using (false)
with check (false);

-- Email login assumes 1 owner per email. If the DB already contains duplicates (e.g., QA seed data),
-- keep the oldest row and null out the rest so we can safely enforce uniqueness.
with ranked as (
  select
    owner_id,
    lower(email) as email_lower,
    row_number() over (partition by lower(email) order by created_at asc, owner_id asc) as rn
  from public.owners
  where email is not null
)
update public.owners o
set email = null
from ranked r
where o.owner_id = r.owner_id
  and r.rn > 1;

create unique index if not exists owners_email_unique_idx
  on public.owners (lower(email))
  where email is not null;
