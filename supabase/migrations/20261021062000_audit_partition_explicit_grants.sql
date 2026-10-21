-- From 2026-10-30 Supabase gives new tables in `public` no default grant to
-- anon, authenticated or service_role. Each audit_logs partition is a new
-- table, so the maintenance function grants service_role explicitly. Same
-- body, security definer and search_path as 20260928192247, plus that grant.
create or replace function private.ensure_audit_log_partitions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_month date := date_trunc('month', now() at time zone 'UTC')::date;
  month_start date;
  month_end date;
  partition_name text;
  partitions jsonb := '[]'::jsonb;
begin
  -- Serialize concurrent cron runs; no arbitrary SQL or table arguments are accepted.
  perform pg_catalog.pg_advisory_xact_lock(282026, 1);
  for month_offset in 0..2 loop
    month_start := (start_month + make_interval(months => month_offset))::date;
    month_end := (month_start + interval '1 month')::date;
    partition_name := 'audit_logs_' || to_char(month_start, 'YYYY_MM');
    execute format(
      'create table if not exists public.%I partition of public.audit_logs for values from (%L) to (%L)',
      partition_name, month_start::text || ' 00:00:00+00', month_end::text || ' 00:00:00+00'
    );
    execute format('alter table public.%I enable row level security', partition_name);
    execute format('alter table public.%I force row level security', partition_name);
    execute format('revoke all on public.%I from anon, authenticated', partition_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', partition_name);
    partitions := partitions || jsonb_build_array(partition_name);
  end loop;
  return jsonb_build_object('partitions', partitions);
end;
$$;
revoke all on function private.ensure_audit_log_partitions() from public, anon, authenticated;
grant execute on function private.ensure_audit_log_partitions() to service_role;

-- Existing partitions keep their grants; grant again so every partition holds
-- the same explicit grant whatever its origin (idempotent).
do $$
declare
  partition_name text;
begin
  for partition_name in
    select child.relname
    from pg_catalog.pg_inherits inheritance
    join pg_catalog.pg_class child on child.oid = inheritance.inhrelid
    join pg_catalog.pg_namespace child_schema on child_schema.oid = child.relnamespace
    where inheritance.inhparent = 'public.audit_logs'::regclass
      and child_schema.nspname = 'public'
  loop
    execute format('grant select, insert, update, delete on public.%I to service_role', partition_name);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
