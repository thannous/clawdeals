-- CONTACT-CONSENT ONLY, ROLLBACK REVIEW. No source execution or role creation.
-- Canonical current rendering: pg_catalog,public; artifact
-- e8dc9ea399f44d60ce891f842127d2d97ce6bffcf3c1114be1e6a8a55fefc8ef.
-- Source catalog is independent of dump. Both repository bodies/literals match
-- attestation; native PG17.11 repository wrappers match both canonical hashes.
-- Same-archive binding and complete imported schema remain execution locks.
BEGIN;
SET LOCAL search_path='';
DO $guard$ DECLARE r record; ids oid[]; fn oid; signature text; BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clawdeals_consent' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Restricted NOLOGIN consent role required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Restricted app role required'; END IF;
 IF pg_has_role('clawdeals_app','clawdeals_consent','MEMBER') THEN RAISE EXCEPTION 'App cannot assume consent role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles p WHERE pg_has_role('clawdeals_consent',p.oid,'MEMBER') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN RAISE EXCEPTION 'Elevated consent membership refused'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND (pg_has_role('clawdeals_consent',c.relowner,'MEMBER') OR pg_has_role('clawdeals_app',c.relowner,'MEMBER'))) THEN RAISE EXCEPTION 'Consent cannot own application tables'; END IF;
 IF has_schema_privilege('clawdeals_app','public','CREATE') OR has_schema_privilege('clawdeals_consent','public','CREATE') THEN RAISE EXCEPTION 'Untrusted public CREATE refused'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('transactions','approvals','agents','owners','listings','watchlists','smartphone_mission_match_state','watchlist_matches','watchlist_match_queue','project_missions') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) THEN RAISE EXCEPTION 'Expected FORCE RLS prerequisite absent'; END IF;
 FOR r IN SELECT * FROM (VALUES
 ('transaction_request_contact_reveal_v1','p_tx_id uuid, p_actor_agent_id uuid','2df6106f4fc97c01d992c0aac85241ed423ad050ec5546fd11942b70564a49c0'),
 ('resolve_contact_reveal_consent_v1','p_approval_id uuid, p_owner_id uuid, p_decision text, p_reason text','e841f2b23df9f95075052a1803847510a751c7fbc7df4834ba9a937f833abf1a')
 ) AS t(name,args,definition_sha256) LOOP
  PERFORM pg_catalog.set_config('search_path','pg_catalog, public',true);
  SELECT pg_catalog.array_agg(p.oid) INTO ids FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=r.name AND pg_catalog.pg_get_function_identity_arguments(p.oid)=r.args AND p.prosecdef;
  IF pg_catalog.cardinality(ids) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Exact consent signature missing'; END IF;
  fn:=ids[1];
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(fn),'UTF8')),'hex')<>r.definition_sha256 THEN RAISE EXCEPTION 'Consent CREATE-wrapper mismatch requires explicit review'; END IF;
  PERFORM pg_catalog.set_config('search_path','',true); signature:=fn::pg_catalog.regprocedure::text;
  EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO clawdeals_consent',signature);
  EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,clawdeals_app',signature);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO clawdeals_app',signature);
 END LOOP;
END $guard$;
GRANT USAGE ON SCHEMA public TO clawdeals_consent;
GRANT SELECT ON public.transactions,public.approvals TO clawdeals_consent;
GRANT SELECT(id,owner_id) ON public.agents TO clawdeals_consent;
GRANT SELECT(owner_id,email,email_verified_at,phone_e164,phone_verified_at) ON public.owners TO clawdeals_consent;
GRANT SELECT(listing_id) ON public.listings TO clawdeals_consent;
GRANT INSERT(owner_id,action_type,action_ref,action_ref_id,action_payload_redacted,created_by_agent_id,state,created_at) ON public.approvals TO clawdeals_consent;
GRANT UPDATE(state,action_ref,action_payload_redacted,created_by_agent_id,created_at,resolved_at,resolved_by_human_id,resolved_reason_text) ON public.approvals TO clawdeals_consent;
GRANT UPDATE(contact_reveal_state,contact_revealed_at,updated_at,status) ON public.transactions TO clawdeals_consent;
GRANT UPDATE(status,updated_at) ON public.listings TO clawdeals_consent;
-- Non-early-return actual invoker listing triggers require these operations.
GRANT SELECT(criteria,deleted_at) ON public.watchlists TO clawdeals_consent;
GRANT SELECT(listing_id,watchlist_id),UPDATE(compatible,updated_at) ON public.smartphone_mission_match_state TO clawdeals_consent;
GRANT SELECT(watchlist_id,entity_type,entity_id),DELETE ON public.watchlist_matches TO clawdeals_consent;
GRANT SELECT(entity_type,entity_id,last_reason,updated_at,attempt_count,last_error),INSERT(entity_type,entity_id,last_reason,updated_at),UPDATE(last_reason,updated_at,attempt_count,last_error) ON public.watchlist_match_queue TO clawdeals_consent;
GRANT SELECT(catalog_snapshots,version),UPDATE(version,selected_configuration_id,confirmed_at,confirmed_version,status,updated_at) ON public.project_missions TO clawdeals_consent;
-- Source service-role bypass is replaced by explicit function-role policies.
-- Restrictive existing policies may still deny; never delete them to pass a test.
CREATE POLICY consent_read_transactions ON public.transactions FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_update_transactions ON public.transactions FOR UPDATE TO clawdeals_consent USING(true) WITH CHECK(true);
CREATE POLICY consent_read_approvals ON public.approvals FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_insert_approvals ON public.approvals FOR INSERT TO clawdeals_consent WITH CHECK(action_type='contact_reveal_consent');
CREATE POLICY consent_update_approvals ON public.approvals FOR UPDATE TO clawdeals_consent USING(action_type IN ('contact_reveal','contact_reveal_consent')) WITH CHECK(action_type IN ('contact_reveal','contact_reveal_consent'));
CREATE POLICY consent_read_agents ON public.agents FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_read_owners ON public.owners FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_read_listings ON public.listings FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_update_listings ON public.listings FOR UPDATE TO clawdeals_consent USING(true) WITH CHECK(status='CONTACT_REVEALED');
CREATE POLICY consent_read_watchlists ON public.watchlists FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_read_mission_state ON public.smartphone_mission_match_state FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_update_mission_state ON public.smartphone_mission_match_state FOR UPDATE TO clawdeals_consent USING(true) WITH CHECK(NOT compatible);
CREATE POLICY consent_read_matches ON public.watchlist_matches FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_delete_matches ON public.watchlist_matches FOR DELETE TO clawdeals_consent USING(entity_type='listing');
CREATE POLICY consent_read_queue ON public.watchlist_match_queue FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_insert_queue ON public.watchlist_match_queue FOR INSERT TO clawdeals_consent WITH CHECK(entity_type='listing' AND last_reason='smartphone_mission_change');
CREATE POLICY consent_update_queue ON public.watchlist_match_queue FOR UPDATE TO clawdeals_consent USING(entity_type='listing') WITH CHECK(entity_type='listing' AND last_reason='smartphone_mission_change');
CREATE POLICY consent_read_projects ON public.project_missions FOR SELECT TO clawdeals_consent USING(true);
CREATE POLICY consent_update_projects ON public.project_missions FOR UPDATE TO clawdeals_consent USING(true) WITH CHECK(status='DRAFT');
ROLLBACK; -- Reviewed fixture proposal only. No archive binding or live application.
