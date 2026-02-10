-- TI-311 follow-up: ensure api_keys.installation_id FK cannot silently "promote" keys to global
-- by setting installation_id to NULL.
--
-- Previous versions used ON DELETE SET NULL; this can break semantics and/or uniqueness constraints.
-- Enforce ON DELETE CASCADE (deleting an installation revokes its installation-scoped keys).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'api_keys'
      and column_name = 'installation_id'
  ) then
    if exists (
      select 1
      from pg_constraint
      where conname = 'api_keys_installation_id_fkey'
    ) then
      alter table public.api_keys
        drop constraint api_keys_installation_id_fkey;
    end if;

    alter table public.api_keys
      add constraint api_keys_installation_id_fkey
      foreign key (installation_id) references public.agent_installations(installation_id) on delete cascade;
  end if;
end $$;

