-- CLI migration creation was unavailable (binary SIGKILL); UTC timestamp generated locally.
-- Only the service role can request creation of the current UTC month and two successors.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

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
    partitions := partitions || jsonb_build_array(partition_name);
  end loop;
  return jsonb_build_object('partitions', partitions);
end;
$$;
revoke all on function private.ensure_audit_log_partitions() from public, anon, authenticated;
grant execute on function private.ensure_audit_log_partitions() to service_role;

create or replace function public.ensure_audit_log_partitions()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.ensure_audit_log_partitions(); $$;
revoke all on function public.ensure_audit_log_partitions() from public, anon, authenticated;
grant execute on function public.ensure_audit_log_partitions() to service_role;

select private.ensure_audit_log_partitions();
notify pgrst, 'reload schema';
