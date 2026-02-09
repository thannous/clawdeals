-- TI-298: Staged commands v0
--
-- Queue-like table to support preview/confirm flows (e.g. chat commands).
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'staged_command_state') then
    create type staged_command_state as enum ('STAGED', 'CONFIRMED', 'EXECUTED', 'CANCELLED', 'EXPIRED');
  end if;
end $$;

create table if not exists public.staged_commands (
  command_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  channel_identity_id uuid references public.channel_identities(channel_identity_id) on delete set null,
  action_type text not null,
  payload_redacted jsonb not null default '{}'::jsonb,
  state staged_command_state not null default 'STAGED',
  approval_id uuid references public.approvals(approval_id) on delete set null,
  result_ref_type text,
  result_ref_id uuid,
  undo_supported boolean not null default false,
  undo_action_type text,
  undo_expires_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists staged_commands_owner_queue_idx
  on public.staged_commands (owner_id, state, created_at desc, command_id desc);

create index if not exists staged_commands_owner_active_idx
  on public.staged_commands (owner_id, created_at desc, command_id desc)
  where state in ('STAGED', 'CONFIRMED');

create index if not exists staged_commands_expires_at_idx
  on public.staged_commands (expires_at asc, command_id asc);

create index if not exists staged_commands_agent_queue_idx
  on public.staged_commands (agent_id, state, created_at desc, command_id desc);

alter table public.staged_commands enable row level security;
alter table public.staged_commands force row level security;

drop policy if exists deny_all_anon_authenticated on public.staged_commands;
create policy deny_all_anon_authenticated
on public.staged_commands
for all
to anon, authenticated
using (false)
with check (false);
