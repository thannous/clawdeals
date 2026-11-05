-- ROLLBACK-ONLY RPC REVIEW. Independent source catalog e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491.
-- Not same-archive proof; no automatic migration/import integration.
-- Dedicated queue/partition signatures are intentionally excluded.
-- Rendering context is a reviewed candidate, not historical source attestation.
-- Both exact identity and exact definition SHA must match; mismatch aborts.
BEGIN;
SET LOCAL search_path='';
DO $roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Restricted app role required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clawdeals_schema_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit) THEN RAISE EXCEPTION 'Reviewed NOLOGIN schema-owner role required'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE pg_has_role('clawdeals_app',oid,'MEMBER') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolname='clawdeals_schema_owner')) THEN RAISE EXCEPTION 'Elevated app membership refused'; END IF;
END $roles$;
-- Does not recreate source default ACLs. These defaults apply only to the named owner.
ALTER DEFAULT PRIVILEGES FOR ROLE clawdeals_schema_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,clawdeals_app;
DO $review$ DECLARE item record; ids oid[]; target oid; qualified_signature text; BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('list_listings_price_asc_v1','p_status listing_status, p_q text, p_category text, p_condition text, p_price_min integer, p_price_max integer, p_include_hidden boolean, p_limit integer, p_cursor_price_amount integer, p_cursor_listing_id uuid','13c8aaafc0b9b128f0be1618da7193065c3bebe90a295126494eb6a09c1faf47'),
 ('list_listings_price_desc_v1','p_status listing_status, p_q text, p_category text, p_condition text, p_price_min integer, p_price_max integer, p_include_hidden boolean, p_limit integer, p_cursor_price_amount integer, p_cursor_listing_id uuid','e18f8439854bb5f3720d3a0d062d2bab9e7082be2a3b30caf9c26590c5b7cde0'),
 ('list_deals_new_v0','p_statuses deal_status[], p_q text, p_tags text[], p_price_max numeric, p_include_hidden boolean, p_limit integer, p_cursor_status deal_status, p_cursor_created_at timestamp with time zone, p_cursor_deal_id uuid','a4778f26ee7c80c6a5e94447911405235aeea45c395ea6f7180c955fb5a930ae'),
 ('list_listings_rank_v1','p_as_of timestamp with time zone, p_status listing_status, p_q text, p_category text, p_condition text, p_price_min integer, p_price_max integer, p_include_hidden boolean, p_limit integer, p_cursor_rank_score numeric, p_cursor_created_at timestamp with time zone, p_cursor_listing_id uuid','54bdfba0d8f2c7273dbf0a63d408dc29256e16f49e55b570ddd8812433a4cd56'),
 ('resolve_approval','p_approval_id uuid, p_owner_id uuid, p_decision text, p_resolved_by uuid, p_reason text','565734a87cb1505f95739dfbcaa46825df86e88e5f7f51196c245994e501c6a9'),
 ('counter_offer_v0','p_previous_offer_id uuid, p_amount integer, p_currency character, p_expires_at timestamp with time zone, p_sender_id uuid','06b5b5ca063c180e5bce948c795262dd71e6e51c783d2a81b9dda6c5ebedfae6'),
 ('transaction_mark_completed_v0','p_tx_id uuid, p_actor_agent_id uuid','ae619399909a21f91a5ca4ccfc8a73a65f962971c40411c3e7acd6e36f79ea34'),
 ('reject_evidence_upload_v1','p_reservation_id uuid','eb1a9798011c6aec1bce7353b474c8c08cd253aa52f4031f7a3ac1b1296b29cb'),
 ('finish_evidence_upload_cleanup_v1','p_reservation_id uuid','fed68622ec9f52b53efb8b63db0b43c718128e99656f2901719b6dc4c9e1dd6e'),
 ('transactions_auto_complete_stale_v0','p_limit integer, p_threshold_days integer','e3d3af95a798a6a38dc400110cc921809e5a89cbae21f83b61f7b61f55eb070a'),
 ('reserve_evidence_upload_v1','p_evidence_pack_id uuid, p_storage_bucket text, p_storage_key text, p_submitted_by evidence_submitted_by, p_issued_to_type text, p_issued_to_id uuid, p_expires_at timestamp with time zone','2f939adc58b9ef88f51b4f7f25d7b3920914924aa9b3176297e211d2fccb1aa3'),
 ('begin_evidence_upload_confirmation_v1','p_evidence_pack_id uuid, p_storage_bucket text, p_storage_key text, p_submitted_by evidence_submitted_by, p_issued_to_type text, p_issued_to_id uuid, p_bytes bigint','599dd06f64a10f4927844aed918ab025ffcdf2c259a83976447694c358d85af8'),
 ('finalize_evidence_upload_v1','p_reservation_id uuid, p_issued_to_type text, p_issued_to_id uuid, p_content_type text, p_bytes bigint, p_sha256 text','6378531ba7ff7336dbfa94251a35f8d99e2c866ea5f1d2811b374bbb4d071ce9'),
 ('claim_expired_evidence_uploads_v1','p_evidence_pack_id uuid, p_limit integer','222cf30a5ddfd44ba9ec1d4fbb9f0ebfa164661381f431fffa505c199929b783'),
 ('offer_accept_v0','p_offer_id uuid, p_actor_agent_id uuid','993f8ba47e05b86def2763a0aef07ccaa65b3db3e2fe51863578c7721e547644'),
 ('connect_session_exchange_v1','p_session_id uuid, p_poll_token_hash text, p_requested_scope text, p_client_type text, p_client_version text, p_device_name text, p_fingerprint text, p_key_prefix text, p_key_hash text, p_now timestamp with time zone','f3f4f703a52165f6b3a5ae3062b5175e54fb4db50e0eddf8915b0a8ac0d35c06'),
 ('save_smartphone_passport_v1','p_listing_id uuid, p_owner_id uuid, p_expected_revision integer, p_model text, p_battery_health_percent integer, p_checks jsonb','53102b71919ed43ae635162f27ae6835565a915ae0b4c8cd3dc53f7f6f52d16c'),
 ('reserve_smartphone_passport_photo_v1','p_listing_id uuid, p_owner_id uuid, p_photo_id uuid, p_check_id text, p_storage_bucket text, p_storage_key text, p_bytes integer','239d8141eea305d8f5e0e9a1e28f0f55abd8278a994e35ce8370915d72115d9c'),
 ('finish_smartphone_passport_photo_v1','p_listing_id uuid, p_owner_id uuid, p_photo_id uuid','2af30f3bb71948bb264428ad7dfc7cb7db359e1ec48cd97b7152dfee404d7489'),
 ('claim_smartphone_passport_photo_deletion_v1','p_listing_id uuid, p_owner_id uuid, p_photo_id uuid','36838c94c0ec8e35c0452fcc03c4c913902511a137f67ce47f98d80b838adb9f'),
 ('record_smartphone_mission_match_v1','p_watchlist_id uuid, p_listing_id uuid, p_listing_snapshot jsonb, p_watchlist_updated_at timestamp with time zone, p_criteria jsonb, p_passport_revision integer, p_compatible boolean, p_reason jsonb','75ecea38f59953917de2d21e4a3eb2f484983d41564d739ecf30b7fdd24555d4'),
 ('checkpoint_watchlist_backfill_v1','p_watchlist_id uuid, p_generation timestamp with time zone, p_progress_version bigint, p_scan_started_at timestamp with time zone, p_scan_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_listings_scanned integer, p_complete boolean','5f7a619b001a3c17ffa1f2dcfbd71b2fc07eaa6ad98373ab4b48d830afea6a75'),
 ('update_project_mission_v1','p_owner_id uuid, p_mission_id uuid, p_expected_version integer, p_action text, p_plan jsonb, p_snapshots jsonb, p_facts jsonb, p_configuration_id text, p_policies jsonb, p_messages jsonb','d4a3d6f4e0d99945a95e083ab5da043d9cdb8e57db7867c986d8e5c8714f958d'),
 ('dispute_resolve_v0','p_dispute_id uuid, p_resolution text, p_resolution_notes_redacted text, p_psp_reference_id text','245649a6b440258af2baf4b2f1c898e173126d9de18a6c579a73fa8b5567c6c4'),
 ('deal_vote_v0','p_deal_id uuid, p_agent_id uuid, p_direction smallint, p_reason text, p_weight numeric','c1fe86096e59f4ac6efd3f7d222822da711c4780f8e428f1ef8424f220c3fea2'),
 ('create_agent_with_owner_limit_v1','p_owner_id uuid, p_name text, p_status text, p_metadata jsonb, p_wallet_address text, p_trust_score integer, p_trust_flags jsonb, p_trust_formula_version integer, p_owner_agent_limit integer','fade8fa94050593405b0edfb418c1bd876d5d2d866565aba7013985aa0852df9'),
 ('risk_rule_candidates_v1','p_signal_type text, p_window_seconds integer, p_threshold integer, p_max_agents integer','0a045e6d3b5cbdaec87fc56a32df79e55b696b89f0c1fc3d596c9c4703abed31'),
 ('add_agent_trust_flag_if_missing_v1','p_agent_id uuid, p_flag text','d33f90c9d27ec7ef41bd4a66e7f90bfd1e3e2bfed58bdf980d923bc1ac1a4a46'),
 ('remove_agent_trust_flag_v1','p_agent_id uuid, p_flag text','315a9250fc5d2db07af84689b1e3012df37031bdd2ffdf0114ecf4ce14b1808e'),
 ('escrow_mark_refunded_v0','p_psp_refund_id text','03eefee2bad3403d7a47db88afc029511bfe770e3b51a2bc144cfb86278696be'),
 ('list_deals_temp_v0','p_q text, p_tags text[], p_price_max numeric, p_include_hidden boolean, p_min_temperature integer, p_limit integer, p_cursor_temperature integer, p_cursor_created_at timestamp with time zone, p_cursor_deal_id uuid','be827d6859278622ce8a9918cda56af8b690763b5ffd9b8921795525751a1f6d'),
 ('list_deals_trend_v0','p_as_of timestamp with time zone, p_q text, p_tags text[], p_price_max numeric, p_include_hidden boolean, p_min_temperature integer, p_limit integer, p_cursor_trend_score numeric, p_cursor_active_at timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_deal_id uuid','c39db27461a3ce981cba7f5f9ba3a57c4f455e5c007e45cd2e0a3ae3acc86597'),
 ('revoke_installation_v1','p_installation_id uuid, p_owner_id uuid, p_now timestamp with time zone','511ef65c11351c93e8b66708c3cb6711ea315f1089090aa7dca0d6a148430a59'),
 ('list_listings_geo_v1','p_lat double precision, p_lng double precision, p_distance_km integer, p_include_hidden boolean, p_limit integer, p_cursor_distance_m double precision, p_cursor_listing_id uuid, p_q text, p_category text, p_condition text, p_price_min integer, p_price_max integer','2a74270673a3ade4a5cbd8814ad8441fca05fcb5b24a4a31f78a1494a17ecee8'),
 ('list_listings_recent_v1','p_status listing_status, p_q text, p_category text, p_condition text, p_price_min integer, p_price_max integer, p_include_hidden boolean, p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_listing_id uuid','5b5fed9e78648bec9578b0e3dfbfbb58183469da1cc9a38e449d82fc99805689'),
 ('offer_cancel_v0','p_offer_id uuid, p_actor_agent_id uuid','f93c94356a1ca72d9a52d1a5b64bebcf53c5853732e4e3b89f0ffa5528d91999'),
 ('offer_decline_v0','p_offer_id uuid, p_actor_agent_id uuid','da934021a62f189fb03af3a3f1c297deea614c24ae7c1a018f97121aaf5f3a65'),
 ('offers_expire_v0','p_limit integer','5fc652c2936ea32f0abdb3bb54501c51812c896ddffcf59dcdaa8225dc5a2b90'),
 ('resolve_approval','p_approval_id uuid, p_owner_id uuid, p_decision text, p_resolved_by uuid','9ff391f3c4244ca6287fe8ef36c6de21c296b8b282a8445babeefceae27dd72e'),
 ('dispute_open_v0','p_escrow_id uuid, p_actor_agent_id uuid, p_reason_code text, p_opened_notes_redacted text','5b8ea43bb6ea29654c18055507dda60734b1af4fd0acb5fd52e7678a1d0d7d42'),
 ('escrow_create_v0','p_tx_id uuid, p_actor_agent_id uuid, p_fee_bps integer','0502e97ec6dfe4e00a6b26c7d31ccc69504fc83549a66cd736120d7d5dab68cf'),
 ('escrow_mark_confirmed_v0','p_escrow_id uuid, p_actor_agent_id uuid','c5f5cbcafba1f9b1d09003feec2cee811e53c652f7a22f48b7b9f43d68ebb14f'),
 ('escrow_mark_delivered_v0','p_escrow_id uuid, p_actor_agent_id uuid','e87bd33cdb0bd61960adc0e965b7c8f3d325778761ac20895574517b89e3ad16'),
 ('escrow_mark_hold_v0','p_psp_payment_id text, p_psp_hold_id text, p_hold_expires_at timestamp with time zone','d32ce9d9e6a4bcb71ef91aaf33aea8f5ca24f59ebd3b97bcde304fa04184630a'),
 ('escrow_mark_released_v0','p_psp_payout_id text','36659bffa6b50d3229343bc003c0fb283ee5430c86cb36554bde893d05c24f49'),
 ('escrow_set_payment_v0','p_escrow_id uuid, p_actor_agent_id uuid, p_psp_provider text, p_psp_payment_id text','993dd61137d16d7c4c1b651115ae163e5bbfd71b25c6d2bf8a908a6ce055c1cb'),
 ('escrow_set_release_pending_v0','p_escrow_id uuid, p_psp_payout_id text','b5292ae25bdaf0c6a1209fbe800fcad364741197a05ac01d1409ac3914443151'),
 ('notification_outbox_increment_attempts_v1','p_outbox_ids uuid[], p_last_error text','67c2da7419d60ad90f8c1f7e60757cac7253aa9f3f3224603af63f52b2db9267')
 ) AS reviewed(name,args,definition_sha256) LOOP
  PERFORM pg_catalog.set_config('search_path','pg_catalog, public',true);
  SELECT pg_catalog.array_agg(p.oid) INTO ids FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=item.name AND pg_catalog.pg_get_function_identity_arguments(p.oid)=item.args AND NOT p.prosecdef AND p.prokind='f';
  IF pg_catalog.cardinality(ids) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Exact invoker signature missing or ambiguous: %',item.name; END IF;
  target:=ids[1];
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(target),'UTF8')),'hex') <> item.definition_sha256 THEN RAISE EXCEPTION 'Definition changed; independently review formatting or transform: %',item.name; END IF;
  PERFORM pg_catalog.set_config('search_path','',true);
  qualified_signature:=target::pg_catalog.regprocedure::text;
  EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO clawdeals_schema_owner',qualified_signature);
  EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,clawdeals_app',qualified_signature);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO clawdeals_app',qualified_signature);
 END LOOP;
END $review$;
-- Table operations/RLS and downstream triggers are separate exact reviewed plans.
-- EXECUTE alone does not establish business-operation viability or tenant safety.
ROLLBACK;
