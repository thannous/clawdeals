-- Review-only exact production policy retirement. Never drops roles.
-- Source catalog SHA256 e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491.
-- Apply only after reviewed replacement policies/privileges, never as generic RLS stripping.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $review$
DECLARE item record; policy record; before_flags jsonb; after_flags jsonb;
BEGIN
 SELECT jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity)) INTO before_flags
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p');
 FOR item IN SELECT * FROM (VALUES
    ('public','acquisition_funnel_events','deny_all_anon_authenticated'),
    ('public','acquisition_revenue_attributions','deny_all_anon_authenticated'),
    ('public','agent_installations','deny_all_anon_authenticated'),
    ('public','agents','deny_all_anon_authenticated'),
    ('public','api_keys','deny_all_anon_authenticated'),
    ('public','approval_jobs','deny_all_anon_authenticated'),
    ('public','approvals','deny_all_anon_authenticated'),
    ('public','audit_logs','deny_all_anon_authenticated'),
    ('public','audit_logs_2026_02','deny_all_anon_authenticated'),
    ('public','audit_logs_2026_03','deny_all_anon_authenticated'),
    ('public','channel_identities','deny_all_anon_authenticated'),
    ('public','connect_sessions','deny_all_anon_authenticated'),
    ('public','deal_comments','deny_all_anon_authenticated'),
    ('public','deal_votes','deny_all_anon_authenticated'),
    ('public','deals','deny_all_anon_authenticated'),
    ('public','disputes','deny_all_anon_authenticated'),
    ('public','escrows','deny_all_anon_authenticated'),
    ('public','evidence_items','deny_all_anon_authenticated'),
    ('public','evidence_links','deny_all_anon_authenticated'),
    ('public','evidence_packs','deny_all_anon_authenticated'),
    ('public','evidence_upload_reservations','deny_all_anon_authenticated'),
    ('public','idempotency_keys','deny_all_anon_authenticated'),
    ('public','ledger_entries','deny_all_anon_authenticated'),
    ('public','listings','deny_all_anon_authenticated'),
    ('public','messages','deny_all_anon_authenticated'),
    ('public','moderation_actions','deny_all_anon_authenticated'),
    ('public','moderation_states','deny_all_anon_authenticated'),
    ('public','notification_outbox','deny_all_anon_authenticated'),
    ('public','notification_preferences','deny_all_anon_authenticated'),
    ('public','oauth_device_authorizations','deny_all_anon_authenticated'),
    ('public','oauth_refresh_tokens','deny_all_anon_authenticated'),
    ('public','offers','deny_all_anon_authenticated'),
    ('public','owner_auth_links','deny_all_anon_authenticated'),
    ('public','owner_sessions','deny_all_anon_authenticated'),
    ('public','owner_verification_challenges','deny_all_anon_authenticated'),
    ('public','owners','deny_all_anon_authenticated'),
    ('public','pairing_tokens','deny_all_anon_authenticated'),
    ('public','policies','deny_all_anon_authenticated'),
    ('public','project_missions','deny_client_access'),
    ('public','psp_accounts','deny_all_anon_authenticated'),
    ('public','psp_config','deny_all_anon_authenticated'),
    ('public','psp_webhook_events','deny_all_anon_authenticated'),
    ('public','ratings','deny_all_anon_authenticated'),
    ('public','reports','deny_all_anon_authenticated'),
    ('public','risk_rule_state','deny_all_anon_authenticated'),
    ('public','risk_rules','deny_all_anon_authenticated'),
    ('public','smartphone_mission_match_state','deny_client_access'),
    ('public','smartphone_passport_photos','deny_client_access'),
    ('public','smartphone_passports','deny_client_access'),
    ('public','staged_commands','deny_all_anon_authenticated'),
    ('public','threads','deny_all_anon_authenticated'),
    ('public','transactions','deny_all_anon_authenticated'),
    ('public','trustscore_recalc_queue','deny_all_anon_authenticated'),
    ('public','watchlist_backfill_queue','deny_all_anon_authenticated'),
    ('public','watchlist_match_queue','deny_all_anon_authenticated'),
    ('public','watchlist_matches','deny_all_anon_authenticated'),
    ('public','watchlist_signups','deny_all_anon_authenticated'),
    ('public','watchlists','deny_all_anon_authenticated')
 ) AS expected(schema_name,relation_name,policy_name) LOOP
  SELECT p.*, c.relrowsecurity, c.relforcerowsecurity INTO policy FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname=item.schema_name AND c.relname=item.relation_name AND p.polname=item.policy_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected source deny policy absent'; END IF;
  IF policy.polcmd<>'*' OR NOT policy.polpermissive
    OR (SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(policy.polroles))<>ARRAY['anon','authenticated']
    OR encode(sha256(convert_to(pg_get_expr(policy.polqual,policy.polrelid),'UTF8')),'hex') IS DISTINCT FROM 'fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa'
    OR encode(sha256(convert_to(pg_get_expr(policy.polwithcheck,policy.polrelid),'UTF8')),'hex') IS DISTINCT FROM 'fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa'
    OR NOT policy.relrowsecurity OR NOT policy.relforcerowsecurity THEN
    RAISE EXCEPTION 'Source deny policy definition/roles/RLS changed';
  END IF;
  -- Removing a permissive false/false policy grants nothing, even where no
  -- replacement app policy is needed: RLS default-deny remains in force.
  EXECUTE format('DROP POLICY %I ON %I.%I',item.policy_name,item.schema_name,item.relation_name);
 END LOOP;
 SELECT jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity)) INTO after_flags
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p');
 IF before_flags IS DISTINCT FROM after_flags THEN RAISE EXCEPTION 'RLS flags changed'; END IF;
END $review$;
ROLLBACK;
