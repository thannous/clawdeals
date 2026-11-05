-- REVIEW TEMPLATE, Neon only. No role/credential creation. Ends ROLLBACK.
-- Separate approved NOLOGIN clawdeals_maintenance role must already exist.
-- Review all existing policies, ownership, inherited grants and function owners.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_maintenance' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit) THEN RAISE EXCEPTION 'Missing restricted NOLOGIN maintenance role'; END IF;
  IF pg_has_role('clawdeals_app','clawdeals_maintenance','MEMBER') THEN RAISE EXCEPTION 'Runtime must not assume maintenance role'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_partitioned_table WHERE partrelid='public.audit_logs'::regclass AND partstrat='r' AND partnatts=1 AND pg_get_partkeydef(partrelid)='RANGE (occurred_at)') THEN RAISE EXCEPTION 'Unexpected audit partition definition'; END IF;
END;
$$;
GRANT USAGE,CREATE ON SCHEMA public TO clawdeals_maintenance;
GRANT USAGE ON SCHEMA private TO clawdeals_maintenance;
-- Verified source audit parent trigger: required when PostgreSQL clones it.
GRANT EXECUTE ON FUNCTION public.capture_acquisition_d7_retention() TO clawdeals_maintenance;
-- Maintenance ownership is deliberately limited to this parent and its direct
-- partitions. FORCE RLS remains enabled. App membership/DDL is never granted.
ALTER TABLE public.audit_logs OWNER TO clawdeals_maintenance;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
DO $$
DECLARE child record;
BEGIN
  FOR child IN SELECT c.relname,n.nspname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE i.inhparent='public.audit_logs'::regclass LOOP
    IF child.nspname <> 'public' OR child.relname !~ '^audit_logs_[0-9]{4}_[0-9]{2}$' THEN RAISE EXCEPTION 'Unexpected audit child'; END IF;
    EXECUTE format('ALTER TABLE public.%I OWNER TO clawdeals_maintenance',child.relname);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',child.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',child.relname);
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION private.ensure_audit_log_partitions() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
DECLARE
  start_month date := pg_catalog.date_trunc('month',pg_catalog.now() AT TIME ZONE 'UTC')::date;
  month_start date; month_end date; partition_name text; relation oid; bounds text;
  partitions jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(282026,1);
  FOR month_offset IN 0..2 LOOP
    month_start := (start_month + pg_catalog.make_interval(months=>month_offset))::date;
    month_end := (month_start + interval '1 month')::date;
    partition_name := 'audit_logs_' || pg_catalog.to_char(month_start,'YYYY_MM');
    relation := pg_catalog.to_regclass(pg_catalog.format('public.%I',partition_name));
    IF relation IS NULL THEN
      EXECUTE pg_catalog.format('CREATE TABLE public.%I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',partition_name,month_start::timestamptz,month_end::timestamptz);
      relation := pg_catalog.to_regclass(pg_catalog.format('public.%I',partition_name));
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=relation AND inhparent='public.audit_logs'::regclass) THEN RAISE EXCEPTION 'Audit partition name collision'; END IF;
    SELECT pg_catalog.pg_get_expr(relpartbound,oid) INTO bounds FROM pg_catalog.pg_class WHERE oid=relation;
    IF bounds IS DISTINCT FROM pg_catalog.format('FOR VALUES FROM (%L) TO (%L)',month_start::timestamptz,month_end::timestamptz) THEN RAISE EXCEPTION 'Unexpected audit partition bounds'; END IF;
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',partition_name);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',partition_name);
    EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM PUBLIC,clawdeals_app',partition_name);
    -- App accesses the parent only; child tables have no direct runtime grants.
    partitions := partitions || pg_catalog.jsonb_build_array(partition_name);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('partitions',partitions);
END;
$$;
CREATE OR REPLACE FUNCTION public.ensure_audit_log_partitions() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.ensure_audit_log_partitions(); $$;
ALTER FUNCTION private.ensure_audit_log_partitions() OWNER TO clawdeals_maintenance;
ALTER FUNCTION public.ensure_audit_log_partitions() OWNER TO clawdeals_maintenance;
REVOKE ALL ON FUNCTION private.ensure_audit_log_partitions() FROM PUBLIC,clawdeals_app;
REVOKE ALL ON FUNCTION public.ensure_audit_log_partitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_audit_log_partitions() TO clawdeals_app;
ROLLBACK; -- Review template: imported privilege closure and owner changes require approval.
