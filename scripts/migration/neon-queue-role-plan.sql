-- QUEUE-ONLY REVIEW TEMPLATE. No credentials or role creation. Never Supabase.
-- Import public/private schema and neon-queue-runtime.sql first. Review all
-- pre-existing restrictive policies and inherited grants before applying.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Missing restricted runtime role'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_functions' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Missing restricted NOLOGIN function role'; END IF;
  IF pg_has_role('clawdeals_app','clawdeals_functions','MEMBER') THEN RAISE EXCEPTION 'Runtime must not assume function role'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p')
    AND (pg_has_role('clawdeals_app',c.relowner,'MEMBER') OR pg_has_role('clawdeals_functions',c.relowner,'MEMBER'))) THEN RAISE EXCEPTION 'Runtime and queue definer must not own tables'; END IF;
END;
$$;
GRANT USAGE ON SCHEMA public,private TO clawdeals_functions;
GRANT USAGE ON SCHEMA public TO clawdeals_app;
REVOKE ALL ON private.queue_dispatch_state FROM PUBLIC,clawdeals_app;
GRANT SELECT,INSERT,UPDATE ON private.queue_dispatch_state TO clawdeals_functions;
ALTER TABLE private.queue_dispatch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.queue_dispatch_state FORCE ROW LEVEL SECURITY;
CREATE POLICY clawdeals_queue_function_state ON private.queue_dispatch_state TO clawdeals_functions
USING(queue_name IN ('watchlist-match-queue','watchlist-backfill-queue','trustscore-recalc-queue','notifications-dispatch'))
WITH CHECK(queue_name IN ('watchlist-match-queue','watchlist-backfill-queue','trustscore-recalc-queue','notifications-dispatch'));
GRANT SELECT ON public.watchlist_match_queue,public.watchlist_backfill_queue,public.trustscore_recalc_queue,public.notification_outbox,public.notification_preferences TO clawdeals_functions;
GRANT UPDATE(available_at,schedule_preferences) ON public.notification_outbox TO clawdeals_functions;
CREATE POLICY clawdeals_queue_function_read ON public.watchlist_match_queue FOR SELECT TO clawdeals_functions USING(true);
CREATE POLICY clawdeals_queue_function_read ON public.watchlist_backfill_queue FOR SELECT TO clawdeals_functions USING(true);
CREATE POLICY clawdeals_queue_function_read ON public.trustscore_recalc_queue FOR SELECT TO clawdeals_functions USING(true);
CREATE POLICY clawdeals_queue_function_read ON public.notification_outbox FOR SELECT TO clawdeals_functions USING(true);
CREATE POLICY clawdeals_queue_function_read ON public.notification_preferences FOR SELECT TO clawdeals_functions USING(true);
CREATE POLICY clawdeals_queue_function_schedule ON public.notification_outbox FOR UPDATE TO clawdeals_functions USING(status='PENDING') WITH CHECK(status='PENDING');
-- These imported administrative routines remain non-public; no Neon cron calls
-- retry_pending_queue_wakes_v1. Configure's replacement only rejects Vault setup.
ALTER FUNCTION private.retry_pending_queue_wakes_v1() OWNER TO clawdeals_functions;
ALTER FUNCTION private.configure_queue_dispatch_v1(text) OWNER TO clawdeals_functions;
ALTER FUNCTION private.configure_queue_dispatch_v1(text) SECURITY INVOKER;
REVOKE ALL ON FUNCTION private.retry_pending_queue_wakes_v1(),private.configure_queue_dispatch_v1(text) FROM PUBLIC,clawdeals_app;
ALTER FUNCTION private.send_queue_wake_v1(text) OWNER TO clawdeals_functions;
ALTER FUNCTION private.wake_queue_consumer_v1() OWNER TO clawdeals_functions;
ALTER FUNCTION private.queue_drain_claim_v1(text,uuid) OWNER TO clawdeals_functions;
ALTER FUNCTION private.queue_drain_release_v1(text,uuid) OWNER TO clawdeals_functions;
ALTER FUNCTION private.notification_schedule_preferences_v1(jsonb) OWNER TO clawdeals_functions;
ALTER FUNCTION private.notification_event_enabled_v1(jsonb,text) OWNER TO clawdeals_functions;
ALTER FUNCTION private.notification_eligible_at_v1(jsonb,timestamptz) OWNER TO clawdeals_functions;
ALTER FUNCTION private.schedule_notification_row_v1() OWNER TO clawdeals_functions;
ALTER FUNCTION private.reschedule_owner_notifications_v1() OWNER TO clawdeals_functions;
ALTER FUNCTION private.reconcile_notification_schedules_v1() OWNER TO clawdeals_functions;
REVOKE ALL ON FUNCTION private.send_queue_wake_v1(text),private.wake_queue_consumer_v1(),private.queue_drain_claim_v1(text,uuid),private.queue_drain_release_v1(text,uuid),private.notification_schedule_preferences_v1(jsonb),private.notification_event_enabled_v1(jsonb,text),private.notification_eligible_at_v1(jsonb,timestamptz),private.schedule_notification_row_v1(),private.reschedule_owner_notifications_v1(),private.reconcile_notification_schedules_v1() FROM PUBLIC,clawdeals_app;
ALTER FUNCTION public.claim_neon_queue_wakes_v1() OWNER TO clawdeals_functions;
ALTER FUNCTION public.queue_drain_claim_v1(text,uuid) OWNER TO clawdeals_functions;
ALTER FUNCTION public.queue_drain_release_v1(text,uuid) OWNER TO clawdeals_functions;
ALTER FUNCTION public.queue_drain_claim_v1(text,uuid) SECURITY DEFINER;
ALTER FUNCTION public.queue_drain_release_v1(text,uuid) SECURITY DEFINER;
ALTER FUNCTION public.claim_neon_queue_wakes_v1() SET search_path='';
ALTER FUNCTION public.queue_drain_claim_v1(text,uuid) SET search_path='';
ALTER FUNCTION public.queue_drain_release_v1(text,uuid) SET search_path='';
REVOKE ALL ON FUNCTION public.claim_neon_queue_wakes_v1(),public.queue_drain_claim_v1(text,uuid),public.queue_drain_release_v1(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_neon_queue_wakes_v1(),public.queue_drain_claim_v1(text,uuid),public.queue_drain_release_v1(text,uuid) TO clawdeals_app;
ROLLBACK; -- Review template: full imported privilege closure is not yet verified.
-- Remaining app policies, TEMP revocation, schema CREATE revocation, role
-- memberships, other business RPCs and maintenance privileges are separate gates.
