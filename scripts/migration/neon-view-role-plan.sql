-- VIEW-ONLY REVIEW CANDIDATE. Never run on Supabase. No role creation; explicit server-only SELECT policies.
-- Exact imported view definitions must be reviewed and archive-bound separately.
-- Existing/inherited grants and restrictive policies remain independent gates.
BEGIN;
DO $$
DECLARE name text;
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'Security-invoker views require PostgreSQL 15+';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app'
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolinherit) THEN
    RAISE EXCEPTION 'Missing restricted runtime role';
  END IF;
  FOREACH name IN ARRAY ARRAY[
    'acquisition_funnel_summary','acquisition_revenue_attribution_summary',
    'ops_obs_market_gauges_v1','ops_obs_queue_depth_gauges_v1',
    'ops_sli_api_write_journeys_daily_v1','ops_sli_approvals_resolve_daily_v1'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=name AND c.relkind='v'
        AND c.reloptions @> ARRAY['security_invoker=true']
        AND NOT pg_has_role('clawdeals_app',c.relowner,'MEMBER')) THEN
      RAISE EXCEPTION 'Missing non-runtime-owned invoker view: %',name;
    END IF;
  END LOOP;
  FOREACH name IN ARRAY ARRAY[
    'acquisition_funnel_events','acquisition_revenue_attributions','deals','listings',
    'watchlists','watchlist_matches','watchlist_match_queue','notification_outbox',
    'approvals','trustscore_recalc_queue','watchlist_backfill_queue','audit_logs'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=name AND c.relkind IN ('r','p')
        AND c.relrowsecurity AND c.relforcerowsecurity
        AND NOT pg_has_role('clawdeals_app',c.relowner,'MEMBER')) THEN
      RAISE EXCEPTION 'Missing non-runtime-owned FORCE RLS dependency: %',name;
    END IF;
  END LOOP;
END;
$$;
GRANT USAGE ON SCHEMA public TO clawdeals_app;
GRANT SELECT ON public.acquisition_funnel_summary,
  public.acquisition_revenue_attribution_summary,public.ops_obs_market_gauges_v1,
  public.ops_obs_queue_depth_gauges_v1,public.ops_sli_api_write_journeys_daily_v1,
  public.ops_sli_approvals_resolve_daily_v1 TO clawdeals_app;
-- Includes nested funnel dependency for the revenue view. The app can read these
-- columns directly subject to RLS; invoker views are not a column-hiding boundary.
GRANT SELECT(acquisition_id,occurred_at,event_name,landing_path,locale,market_code,
  source,medium,campaign,channel,cta_location,interaction_type)
  ON public.acquisition_funnel_events TO clawdeals_app;
GRANT SELECT(escrow_id,acquisition_id,occurred_at,currency,gross_volume_minor,
  platform_revenue_minor,attribution_model)
  ON public.acquisition_revenue_attributions TO clawdeals_app;
GRANT SELECT(deal_id,market_code) ON public.deals TO clawdeals_app;
GRANT SELECT(listing_id,market_code) ON public.listings TO clawdeals_app;
GRANT SELECT(market_code,active,deleted_at) ON public.watchlists TO clawdeals_app;
GRANT SELECT(matched_at,entity_type,entity_id) ON public.watchlist_matches TO clawdeals_app;
GRANT SELECT(updated_at,entity_type,entity_id) ON public.watchlist_match_queue TO clawdeals_app;
GRANT SELECT(status,last_error,entity_type,entity_id) ON public.notification_outbox TO clawdeals_app;
GRANT SELECT(state,created_at,resolved_at) ON public.approvals TO clawdeals_app;
GRANT SELECT(updated_at) ON public.trustscore_recalc_queue TO clawdeals_app;
GRANT SELECT(updated_at) ON public.watchlist_backfill_queue TO clawdeals_app;
-- JSONB permission is for the entire column, not just keys used by the SLI view.
GRANT SELECT(occurred_at,action,request) ON public.audit_logs TO clawdeals_app;
-- Global server-only read parity with the source service_role. NOT tenant isolation.
CREATE POLICY clawdeals_view_app_read ON public.acquisition_funnel_events FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.acquisition_revenue_attributions FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.deals FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.listings FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.watchlists FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.watchlist_matches FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.watchlist_match_queue FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.notification_outbox FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.approvals FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.trustscore_recalc_queue FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.watchlist_backfill_queue FOR SELECT TO clawdeals_app USING(true);
CREATE POLICY clawdeals_view_app_read ON public.audit_logs FOR SELECT TO clawdeals_app USING(true);
ROLLBACK; -- Review candidate: archive binding and app policy authorization required.
