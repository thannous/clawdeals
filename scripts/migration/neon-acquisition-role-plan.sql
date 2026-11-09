-- REVIEW ONLY: explicit acquisition integration, separate from narrow d7 trigger policy.
-- Trusted server-only role, not tenant isolation; actual dump/ACL/column binding required.
-- Source public.acquisition_funnel_events metadata SHA256:
-- 3dbc7a4a16ffac70cd3a7e6482192922810f39c25f05e68e806884b2cba97df8
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) THEN RAISE EXCEPTION 'Restricted app role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='acquisition_funnel_events' AND c.relkind='r' AND NOT c.relispartition AND NOT pg_has_role('clawdeals_app',c.relowner,'MEMBER')) THEN RAISE EXCEPTION 'Expected nonowned acquisition table required'; END IF;
  IF has_database_privilege('clawdeals_app',current_database(),'TEMP') OR has_schema_privilege('clawdeals_app','public','CREATE') OR has_schema_privilege('clawdeals_app','private','USAGE') THEN RAISE EXCEPTION 'App TEMP/DDL/private access must be removed first'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO clawdeals_app;
-- Full-row SELECT is required by current adapter SELECT t.* / RETURNING t.*.
GRANT SELECT, INSERT ON TABLE public.acquisition_funnel_events TO clawdeals_app;
ALTER TABLE public.acquisition_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_funnel_events FORCE ROW LEVEL SECURITY;
CREATE POLICY neon_acquisition_analytics_read ON public.acquisition_funnel_events
  FOR SELECT TO clawdeals_app USING (true);
-- Finite set matches shared ACQUISITION_EVENT_NAMES and reviewed source CHECK.
CREATE POLICY neon_acquisition_analytics_insert ON public.acquisition_funnel_events
  FOR INSERT TO clawdeals_app WITH CHECK (event_name IN (
    'landing_view','organic_entry','connect_cta_clicked','activation_started',
    'agent_connected','watchlist_created','first_match','d7_retained'
  ));
-- This deliberately broadens the union of permissive policies beyond the narrow
-- trigger's first_match/d7 read and d7-only insert. It is not an implicit override.
-- No UPDATE/DELETE privilege or policy is added. Existing excess ACLs need review.
ROLLBACK; -- Review candidate: actual dump parity and assembled authorization are not approved.
