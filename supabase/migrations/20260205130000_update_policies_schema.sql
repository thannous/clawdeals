create extension if not exists "pgcrypto";

-- Remove obsolete index if present
drop index if exists policies_status_idx;

-- Rename legacy columns when running on existing schema
do $$
begin
   if exists (
     select 1
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'policies'
       and column_name = 'id'
   ) then
     alter table public.policies rename column id to policy_id;
   end if;

   if exists (
     select 1
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'policies'
       and column_name = 'body'
   ) then
     alter table public.policies rename column body to policy_json;
   end if;

   if exists (
     select 1
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'policies'
       and column_name = 'name'
   ) then
     alter table public.policies drop column name;
   end if;

   if exists (
     select 1
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'policies'
       and column_name = 'status'
   ) then
     alter table public.policies drop column status;
   end if;
end $$;

alter table public.policies
  add column if not exists owner_id uuid;

alter table public.policies
  add column if not exists version int not null default 1;

alter table public.policies
  alter column policy_json set default '{}'::jsonb;

alter table public.policies
  alter column policy_json set not null;

alter table public.policies
  alter column updated_at set not null;

update public.policies
set policy_json = coalesce(policy_json, '{}'::jsonb),
    updated_at = coalesce(updated_at, now());

create unique index if not exists policies_owner_id_key on public.policies (owner_id);

do $$
begin
   if not exists (
     select 1
     from pg_constraint
     where conname = 'policies_owner_id_fkey'
   ) then
     alter table public.policies
       add constraint policies_owner_id_fkey
       foreign key (owner_id) references public.owners(owner_id) on delete cascade;
   end if;
end $$;
