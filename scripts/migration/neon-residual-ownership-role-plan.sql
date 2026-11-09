-- FIXTURE-BOUND REVIEW ONLY. Exact residual ownership from production-schema composition.
-- No extension members, managed schemas, existing dedicated owners or remote apply.
-- Requires the separately reviewed source/schema canonical bindings and role plans.
BEGIN;
SET LOCAL search_path='';
DO $roles$ BEGIN
 IF current_database()<>'composition' THEN RAISE EXCEPTION 'Only explicit local composition fixture database approved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_schema_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Restricted NOLOGIN schema owner required'; END IF;
 IF pg_has_role('clawdeals_app','clawdeals_schema_owner','MEMBER') OR pg_has_role('schema_restore','clawdeals_schema_owner','MEMBER') THEN RAISE EXCEPTION 'Runtime/restore owner membership refused'; END IF;
END $roles$;
-- Administrative ownership transfer grants CREATE only to the NOLOGIN schema owner,
-- never to the app or consent/queue roles. Audit tables stay maintenance-owned.
ALTER SCHEMA public OWNER TO clawdeals_schema_owner;
ALTER SCHEMA private OWNER TO clawdeals_schema_owner;
DO $relations$ DECLARE item record; target oid; BEGIN
 FOR item IN SELECT * FROM (VALUES
('public','notification_preferences','r'),
('public','oauth_device_authorizations','r'),
('public','approvals','r'),
('public','acquisition_funnel_events','r'),
('public','agent_installations','r'),
('public','api_keys','r'),
('public','channel_identities','r'),
('public','evidence_packs','r'),
('public','ledger_entries','r'),
('public','watchlist_backfill_queue','r'),
('public','watchlists','r'),
('public','ratings','r'),
('public','smartphone_mission_match_state','r'),
('public','reports','r'),
('public','risk_rule_state','r'),
('public','evidence_upload_reservations','r'),
('public','acquisition_revenue_attributions','r'),
('public','agents','r'),
('public','approval_jobs','r'),
('private','queue_dispatch_state','r'),
('public','escrows','r'),
('public','acquisition_funnel_summary','v'),
('public','acquisition_revenue_attribution_summary','v'),
('public','ops_obs_market_gauges_v1','v'),
('public','ops_obs_queue_depth_gauges_v1','v'),
('public','ops_sli_api_write_journeys_daily_v1','v'),
('public','ops_sli_approvals_resolve_daily_v1','v'),
('public','connect_sessions','r'),
('public','deal_comments','r'),
('public','deal_votes','r'),
('public','deals','r'),
('public','disputes','r'),
('public','evidence_items','r'),
('public','evidence_links','r'),
('public','idempotency_keys','r'),
('public','listings','r'),
('public','messages','r'),
('public','moderation_actions','r'),
('public','moderation_states','r'),
('public','notification_outbox','r'),
('public','oauth_device_user_code_attempts','r'),
('public','oauth_refresh_tokens','r'),
('public','offers','r'),
('public','owner_auth_links','r'),
('public','owner_sessions','r'),
('public','owner_verification_challenges','r'),
('public','owners','r'),
('public','pairing_tokens','r'),
('public','policies','r'),
('public','project_missions','r'),
('public','psp_accounts','r'),
('public','psp_config','r'),
('public','psp_webhook_events','r'),
('public','risk_rules','r'),
('public','smartphone_passport_photos','r'),
('public','smartphone_passports','r'),
('public','staged_commands','r'),
('public','threads','r'),
('public','transactions','r'),
('public','trustscore_recalc_queue','r'),
('public','watchlist_match_queue','r'),
('public','watchlist_matches','r'),
('public','watchlist_signups','r')
 ) AS t(schema_name,name,kind) LOOP
  SELECT c.oid INTO target FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=item.schema_name AND c.relname=item.name AND c.relkind::text=item.kind AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='schema_restore');
  IF target IS NULL OR EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_class'::regclass AND objid=target AND deptype='e') THEN RAISE EXCEPTION 'Exact nonextension relation ownership mismatch: %',item.name; END IF;
  EXECUTE format('ALTER %s %I.%I OWNER TO clawdeals_schema_owner',CASE WHEN item.kind='v' THEN 'VIEW' WHEN item.kind='m' THEN 'MATERIALIZED VIEW' WHEN item.kind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,item.schema_name,item.name);
 END LOOP;
END $relations$;
DO $enums$ DECLARE item record; target oid; actual text; BEGIN
 FOR item IN SELECT * FROM (VALUES
('public','agent_installation_status','9749f4bdd31b40d3ad781c06422aa26671c10a96f178076ff09def64a52590f6'),
('public','api_key_state','02f22bec03a8a26423e4a68a85df9e550c5493be8b2a9ae4bd85e5e8769ab186'),
('public','approval_state','af93d3d2e023a5f2ba67f102b35099a95060460ee66eef81cebd6b312e25c171'),
('public','channel_identity_state_enum','339ac8e1a5376056e2987f12e497dc1c2751a2c68df3651fe7be9a5f74e4dce2'),
('public','channel_role_enum','645a06b4116c805e1e7c4473e6a2afce7400df47ad26a537a97e2f126678f684'),
('public','channel_type_enum','8686754aea5fd15cbcf536f47e9ca9b0bb722c7b647314eb3b9bb210da715e3a'),
('public','connect_session_status','4560a5ebb9adedb6de5222b13fc895cb8edb4ecaf77e873bebd2caa139137c29'),
('public','contact_reveal_state','4237462a30af86b994bedd68b3ee3d0a7bf2c2a9b6bd77ccb32eea5fac30f076'),
('public','deal_status','a71dca34802fd66ee424991a7753b6e95ce15e40d51d68b181905365943781a4'),
('public','dispute_opened_by','2614c5cf79e668f8c6ba0654e71ac861b6e2793d0709f33f1caeb7c74496759c'),
('public','dispute_resolution','d06493f38ea77aa90c79124d705e65bcb9a8ccff1e4d6565c2aea27532188f91'),
('public','dispute_status','7800670469800333146846e2242d6809ce3cc8665b2ad3e636453b6d838b4f00'),
('public','escrow_status','ad67fe63fc41944cbeb73e82c4dfefda5dcc08261b7ebb9f4c9e8e382f1001fc'),
('public','evidence_link_type','7f7b3e66b96a6cc8f6dfb48ec78b8a4b68cecb07ca82dab6cdeb0ae7ecc8f90a'),
('public','evidence_submitted_by','a38ca2028d3e0b8452dd99906cf99ff65f753c79fed73052c9e1cc2e442091ac'),
('public','ledger_entry_type','9801e725e8d81543532de56597df3e5fe3d9724293eee95c280960cd4464da64'),
('public','listing_status','25944873637e6316b95aac55686683cc0008a7193b64f6ec6701d9c7c1ddfb3a'),
('public','message_sender_type','f6e1de4551dd9bc3a10ef262a991f3611edc59dbfb90f6a00d84fd6be91c9fea'),
('public','message_type','a94d05b5c04b3345285129d389c87434b64b780c214c210d0110c571839d585a'),
('public','notification_mode_enum','e879b45fd925e3bf403433466bdd163bd081cb38cb1dc07d26d4c91fe4be72f8'),
('public','oauth_device_authorization_status','bdbb23e39a3eb64efb67d89daa7f7c727ed1b5396570f9cc324070a1e6e0437e'),
('public','offer_status','9b8fa08abb6ccf095f780c70d090148f494726d329f8086dad35db0588c255d0'),
('public','owner_session_status','07b4c38c391e7b5eb8967ec2e79aae05650d5c9da40bb4f67699145d07f861f7'),
('public','owner_verification_type','fddcbc81da257eccead53789d7007ee6df6d85c9c38b5c7bfb05d75abe213087'),
('public','psp_kyc_status','04234619937d5810cca48adaa235d8b01db15b7cc859f88e5f04ec482405b04b'),
('public','psp_webhook_event_status','7c0deddca834b8c1c83f049846244c760ce0aa0c6799d70ae299fd3f47c2f554'),
('public','report_entity_type','15dfa1a5914ab34e5a15ca977865bb654c2011c3066e18fcc637df30fef6632a'),
('public','report_reason_code','9840f996a92d99570b7bbc6159db3c609f8535a6be837eda4ec67776aea0222e'),
('public','report_status','a6954089006acee82889ba1ac9ad4b5feb365eb6fefffa8c83de04d7668274f6'),
('public','staged_command_state','84afcfaf26162d028e34f83d25c41fe9ef39ae2d36c3aac623a18bdbf7a18645'),
('public','thread_status','209af743d716a5cb58af385437bba063491cb92f2c283e42f8431953be69ca4d'),
('public','thread_type','4b80df87d067517eecc82dabc9bde3971f08fadcc68fb870de5cc1650f605e65'),
('public','transaction_status','ad9b5bcf612370cbb764dae60bea5a55b70584e7f07183a3e10dd38d39671c92')
 ) AS t(schema_name,name,labels_sha256) LOOP
  SELECT t.oid INTO target FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=item.schema_name AND t.typname=item.name AND t.typtype='e' AND t.typowner=(SELECT oid FROM pg_roles WHERE rolname='schema_restore');
  IF target IS NULL OR EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_type'::regclass AND objid=target AND deptype='e') THEN RAISE EXCEPTION 'Exact nonextension enum mismatch'; END IF;
  SELECT encode(sha256(convert_to(string_agg(enumlabel,E'\n' ORDER BY enumsortorder),'UTF8')),'hex') INTO actual FROM pg_enum WHERE enumtypid=target;
  IF actual<>item.labels_sha256 THEN RAISE EXCEPTION 'Enum labels differ'; END IF;
  EXECUTE format('ALTER TYPE %I.%I OWNER TO clawdeals_schema_owner',item.schema_name,item.name);
 END LOOP;
END $enums$;
DO $routines$ DECLARE item record; ids oid[]; target oid; signature text; BEGIN
 FOR item IN SELECT * FROM (VALUES
('public','advance_smartphone_mission_market_clock_v1','','85ed50b4c597877e70eadedaf03f42fb06222ef12c87567287abbaf3d7fd3fbf'),
('public','configure_queue_dispatch_v1','p_secret text','4e2c3967cd12c235a1a4fe495f8626c889c0a38ad7db4375472258de45529813'),
('public','set_offer_proposer_v1','','a713c512aedebe3f550ded3b67c020e974e15f8b3f60ca01ec4f0b04f29b02e6'),
('public','offer_accept_locked_impl_v0','p_offer_id uuid, p_actor_agent_id uuid','fd582d62071239390216967aaa91cec0f1097a7be37d7dc86442907bae053d78'),
('public','advance_watchlist_queue_clock_v1','','2398a65c137ec4710de23a4c6441796aabf3168c8b048d9ab2a83c8529ab5dee'),
('public','approvals_apply_side_effects_v1','','a190a8b7281f9ebed47c3887df9fcc15dc78f5669441452bd80e577f0e3951bd'),
('public','deals_search_tsv_update_v1','','22293fcfb3073d80eceaa16def5d221afba89afe9a8e13db9c238c418c2937d6'),
('public','capture_released_escrow_acquisition','','b6ffe5e03fa2734f566da739efe06eee5a2a164adc7d89b4bc0c2013de9df538'),
('public','capture_acquisition_d7_retention','','5a0aecc4616445367fa1e73ce442c846d3cb0eacfb96897f04d99c2041275787'),
('public','connect_effective_scopes_v1','p_requested_scopes text[]','66a51499ee83834735260a0e3231c0b95135405f19991605266111423d350de4'),
('public','enqueue_smartphone_mission_change_v1','','b7b7b57f0f646112628a883391f4d6acfe8a77d5065095d9acc844eda65646d8'),
('public','enqueue_smartphone_mission_criteria_v1','','c16fa6d689335bfe94b0d9ae7000961ea3ccdac3176d7e3ec89614abb9a3736b'),
('public','enqueue_watchlist_match_queue_v1','','5cfa4dc9ad2b67c37b9d44ab6ea85bd408442fedc760197d626acf126c65629b'),
('public','invalidate_project_missions_v1','','6b90724aa360627193f9adb66aa0af1da70e591d171dd8076de15a71e14dce7c'),
('public','list_deals_trend_v1','p_as_of timestamp with time zone, p_q text, p_tags text[], p_price_max numeric, p_include_hidden boolean, p_min_temperature integer, p_limit integer, p_cursor_trend_score numeric, p_cursor_created_at timestamp with time zone, p_cursor_deal_id uuid','84c6fdcb04698a60f96eca4cc5ac75bc42a8458010ce81e98a9bef69b1b1f800'),
('public','listings_search_tsv_update_v1','','7cdf1390742a2f7bffc7d2ebeadaecac781911814b5f7d2ea9f7bd13dd35a564'),
('public','reset_watchlist_backfill_progress_v1','','e24ff19076d8d927ea222966da4254ed43dfbb796b9f272f9d16137200df8b98'),
('public','transaction_request_contact_reveal_v0','p_tx_id uuid, p_actor_agent_id uuid, p_auto_approve boolean','577088fc0206cd9607f6757af2ee27128bed1a9e340487dde716c0c175e866a6')
 ) AS t(schema_name,name,args,definition_sha256) LOOP
  PERFORM pg_catalog.set_config('search_path','pg_catalog, public',true);
  SELECT pg_catalog.array_agg(p.oid) INTO ids FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=item.schema_name AND p.proname=item.name AND pg_catalog.pg_get_function_identity_arguments(p.oid)=item.args AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='schema_restore');
  IF pg_catalog.cardinality(ids) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Exact residual routine mismatch'; END IF;target:=ids[1];
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_depend WHERE classid='pg_catalog.pg_proc'::pg_catalog.regclass AND objid=target AND deptype='e') OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(target),'UTF8')),'hex')<>item.definition_sha256 THEN RAISE EXCEPTION 'Residual routine definition/extension mismatch'; END IF;
  PERFORM pg_catalog.set_config('search_path','',true);signature:=target::pg_catalog.regprocedure::text;
  EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO clawdeals_schema_owner',signature);
  EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,clawdeals_app',signature);
 END LOOP;
END $routines$;
-- Proven direct SQL helper edges, not all remaining routines.
GRANT EXECUTE ON FUNCTION public.connect_effective_scopes_v1(text[]),public.offer_accept_locked_impl_v0(uuid,uuid) TO clawdeals_app;
-- Geo function already has fixed pg_catalog,public,extensions search_path.
-- Existing official extension function EXECUTE is untouched; no broad grant.
GRANT USAGE ON SCHEMA extensions TO clawdeals_app;
ALTER DATABASE composition OWNER TO clawdeals_schema_owner;
REVOKE ALL ON DATABASE composition FROM schema_restore;
REVOKE ALL ON SCHEMA public,private,extensions FROM schema_restore;
ALTER ROLE schema_restore NOLOGIN;
ROLLBACK; -- Only isolated test copy may commit. No remote ownership approval.
