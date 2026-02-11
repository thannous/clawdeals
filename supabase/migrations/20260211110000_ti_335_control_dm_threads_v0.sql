-- TI-335: Control DM thread type + unique owner/agent control channel.
--
-- This extends `threads` to support non-marketplace control channels used for
-- owner/agent confirmations without requiring a listing context.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'thread_type') then
    create type thread_type as enum ('MARKETPLACE', 'CONTROL_DM');
  end if;
end $$;

alter table public.threads
  add column if not exists thread_type thread_type not null default 'MARKETPLACE',
  add column if not exists control_owner_id uuid,
  add column if not exists control_agent_id uuid;

-- Marketplace threads still require listing/buyer/seller; control DM threads do not.
alter table public.threads
  alter column listing_id drop not null,
  alter column buyer_agent_id drop not null,
  alter column seller_agent_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'threads_control_owner_id_fkey'
  ) then
    alter table public.threads
      add constraint threads_control_owner_id_fkey
      foreign key (control_owner_id) references public.owners(owner_id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'threads_control_agent_id_fkey'
  ) then
    alter table public.threads
      add constraint threads_control_agent_id_fkey
      foreign key (control_agent_id) references public.agents(id) on delete cascade;
  end if;
end $$;

alter table public.threads
  drop constraint if exists threads_kind_shape_check;

alter table public.threads
  add constraint threads_kind_shape_check
  check (
    (
      thread_type = 'MARKETPLACE'
      and listing_id is not null
      and buyer_agent_id is not null
      and seller_agent_id is not null
      and control_owner_id is null
      and control_agent_id is null
    )
    or
    (
      thread_type = 'CONTROL_DM'
      and listing_id is null
      and buyer_agent_id is null
      and seller_agent_id is null
      and control_owner_id is not null
      and control_agent_id is not null
    )
  );

create unique index if not exists threads_control_dm_owner_agent_unique_idx
  on public.threads (control_owner_id, control_agent_id)
  where thread_type = 'CONTROL_DM';

create index if not exists threads_control_dm_owner_created_idx
  on public.threads (control_owner_id, created_at desc, thread_id desc)
  where thread_type = 'CONTROL_DM';

create index if not exists threads_control_dm_agent_created_idx
  on public.threads (control_agent_id, created_at desc, thread_id desc)
  where thread_type = 'CONTROL_DM';
