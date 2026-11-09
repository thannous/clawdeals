-- REVIEW ONLY. Never execute against Supabase. Actual dump/column/default/trigger binding is required.
-- Trusted server role semantics; USING(true) does NOT provide tenant isolation.
-- Additive candidate, not an ACL reset: inherited/legacy grants and restrictive policies need separate review.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) THEN RAISE EXCEPTION 'Restricted app role required'; END IF;
  IF has_database_privilege('clawdeals_app',current_database(),'TEMP') OR has_schema_privilege('clawdeals_app','public','CREATE') OR has_schema_privilege('clawdeals_app','private','USAGE') THEN RAISE EXCEPTION 'App TEMP/DDL/private access must be removed first'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND pg_has_role('clawdeals_app',c.relowner,'MEMBER')) THEN RAISE EXCEPTION 'App must not own or assume table owners'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO clawdeals_app;
-- EXCLUDED public.acquisition_funnel_events: separate acquisition policy integration; observed SELECT, INSERT.
-- EXCLUDED public.acquisition_funnel_summary: separate view role plan; observed SELECT.
-- EXCLUDED public.acquisition_revenue_attribution_summary: separate view role plan; observed SELECT.
-- Source identity public.agent_installations; kind r; metadata SHA256 68462efe9d1dd261f1438d9cc9a2b54e9693e29c2510c6afadd67906b3dd09b4
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agent_installations' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.agent_installations identity'; END IF; END $$;
GRANT SELECT, INSERT, DELETE ON TABLE public."agent_installations" TO clawdeals_app;
ALTER TABLE public."agent_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_installations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."agent_installations" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."agent_installations" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."agent_installations" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.agents; kind r; metadata SHA256 c357ec3153bf1051fc2ee2d15bc56d33257b6c19135a771e9a0136d7d9bf88dc
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agents' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.agents identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."agents" TO clawdeals_app;
ALTER TABLE public."agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."agents" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."agents" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."agents" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."agents" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.api_keys; kind r; metadata SHA256 27aca36bbe160ff7b580bbd17e24eaab1a198190f38e4993abbead9870c11919
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='api_keys' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.api_keys identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."api_keys" TO clawdeals_app;
ALTER TABLE public."api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."api_keys" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."api_keys" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."api_keys" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.approval_jobs; kind r; metadata SHA256 907003712ffe904931e47ccffb571b030d605961c7501a7bea1b0ed7c7540c88
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='approval_jobs' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.approval_jobs identity'; END IF; END $$;
GRANT SELECT, UPDATE ON TABLE public."approval_jobs" TO clawdeals_app;
ALTER TABLE public."approval_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."approval_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."approval_jobs" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_update" ON public."approval_jobs" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.approvals; kind r; metadata SHA256 4c9c88f9c1dbf871797d70f8fc91455021ef2f492219f5816e33d6a55d4f776c
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='approvals' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.approvals identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."approvals" TO clawdeals_app;
ALTER TABLE public."approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."approvals" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."approvals" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."approvals" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.audit_logs; kind p; metadata SHA256 095bfe766ea593c3f832b05e810a7a4b345b88326d6989b05a25a76f73d4bf65
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='audit_logs' AND c.relkind='p' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.audit_logs identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_logs" TO clawdeals_app;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."audit_logs" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."audit_logs" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."audit_logs" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."audit_logs" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.channel_identities; kind r; metadata SHA256 9fabab02eb0d4a789093353b42bfe1374baede1a321eef65ecd6e0f9ae71dcbe
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='channel_identities' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.channel_identities identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."channel_identities" TO clawdeals_app;
ALTER TABLE public."channel_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."channel_identities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."channel_identities" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."channel_identities" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."channel_identities" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.connect_sessions; kind r; metadata SHA256 e911be3e3fcfed64452e1a82b1233ac33a5426e8ae93f9d210f5c8c65c6397da
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='connect_sessions' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.connect_sessions identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."connect_sessions" TO clawdeals_app;
ALTER TABLE public."connect_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."connect_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."connect_sessions" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."connect_sessions" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."connect_sessions" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.deal_comments; kind r; metadata SHA256 fc41f372fd75ad3edcd0a078a6510afa9d76275aedbcdfb096643f4c92ca6e9c
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='deal_comments' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.deal_comments identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."deal_comments" TO clawdeals_app;
ALTER TABLE public."deal_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."deal_comments" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."deal_comments" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.deal_votes; kind r; metadata SHA256 74df32e26d876b8784cd8b7ec7ad2d2dfe305de859a994777e44047f3af8bb91
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='deal_votes' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.deal_votes identity'; END IF; END $$;
GRANT SELECT ON TABLE public."deal_votes" TO clawdeals_app;
ALTER TABLE public."deal_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_votes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."deal_votes" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.deals; kind r; metadata SHA256 9c7a5648831ec3f1b71294f58d850573f6b1911e82adb88349e023346983032c
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='deals' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.deals identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."deals" TO clawdeals_app;
ALTER TABLE public."deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."deals" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."deals" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."deals" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."deals" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.disputes; kind r; metadata SHA256 f2377e79a44bb49882a7b2741745f43ff2a1f41ecaca5a30a93fe98365535c52
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='disputes' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.disputes identity'; END IF; END $$;
GRANT SELECT, UPDATE ON TABLE public."disputes" TO clawdeals_app;
ALTER TABLE public."disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."disputes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."disputes" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_update" ON public."disputes" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.escrows; kind r; metadata SHA256 3041ecb243c77e921df055935737cdf53f58ba76f9dd46ca2710d49b9850b852
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='escrows' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.escrows identity'; END IF; END $$;
GRANT SELECT ON TABLE public."escrows" TO clawdeals_app;
ALTER TABLE public."escrows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."escrows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."escrows" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.evidence_items; kind r; metadata SHA256 4095fc950fabca6b2c9354cbd17919abf525a7d743e7d79a0c29fdb3f29e2552
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='evidence_items' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.evidence_items identity'; END IF; END $$;
GRANT SELECT ON TABLE public."evidence_items" TO clawdeals_app;
ALTER TABLE public."evidence_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evidence_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."evidence_items" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.evidence_links; kind r; metadata SHA256 ddb9b9cbe5f420d7a43bffafbc217909e00d471a2fa1c5667587cfc4fab852e7
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='evidence_links' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.evidence_links identity'; END IF; END $$;
GRANT SELECT ON TABLE public."evidence_links" TO clawdeals_app;
ALTER TABLE public."evidence_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evidence_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."evidence_links" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.evidence_packs; kind r; metadata SHA256 ab20e5e304de0459f6c4cd12377a6c70c18bad5ddc97bd609d5e55161f340377
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='evidence_packs' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.evidence_packs identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."evidence_packs" TO clawdeals_app;
ALTER TABLE public."evidence_packs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evidence_packs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."evidence_packs" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."evidence_packs" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."evidence_packs" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.idempotency_keys; kind r; metadata SHA256 9c1dfaaccb279c3ce6f15c6197fd63e4503162ed20c7c2a0a420f0ac0aa3f9f7
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='idempotency_keys' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.idempotency_keys identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."idempotency_keys" TO clawdeals_app;
ALTER TABLE public."idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."idempotency_keys" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."idempotency_keys" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."idempotency_keys" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."idempotency_keys" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.listings; kind r; metadata SHA256 f658292df63f634781a1a72310df1056ddfd9e0669d68d308774ad16fd32909f
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='listings' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.listings identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."listings" TO clawdeals_app;
ALTER TABLE public."listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."listings" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."listings" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."listings" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."listings" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.messages; kind r; metadata SHA256 badb13a8282164d9712f244b5bbc1c87d713532bccb0026917fd8fce4b4da460
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='messages' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.messages identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."messages" TO clawdeals_app;
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."messages" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."messages" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.moderation_actions; kind r; metadata SHA256 8c6dd9ca89c9bd5789651cebe645a2b0d47fc70cbfb8a4c207b7bc367362a84d
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='moderation_actions' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.moderation_actions identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."moderation_actions" TO clawdeals_app;
ALTER TABLE public."moderation_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."moderation_actions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."moderation_actions" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."moderation_actions" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.moderation_states; kind r; metadata SHA256 63ee278460f90abe7d0ac064e7f9d8b656ad54997720235d97090d0f310dc0ef
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='moderation_states' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.moderation_states identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."moderation_states" TO clawdeals_app;
ALTER TABLE public."moderation_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."moderation_states" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."moderation_states" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."moderation_states" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."moderation_states" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.notification_outbox; kind r; metadata SHA256 af35e87f640493731882a528f24cabab4ccbb0290673cab8e6b86cb35320072e
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='notification_outbox' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.notification_outbox identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."notification_outbox" TO clawdeals_app;
ALTER TABLE public."notification_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_outbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."notification_outbox" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."notification_outbox" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."notification_outbox" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.notification_preferences; kind r; metadata SHA256 c1933054ed407bdcd3e21527e683b30493acc6bdb4e588c5498b80fcb026645d
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='notification_preferences' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.notification_preferences identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."notification_preferences" TO clawdeals_app;
ALTER TABLE public."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."notification_preferences" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."notification_preferences" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."notification_preferences" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.oauth_device_authorizations; kind r; metadata SHA256 6a8e746af7f39a3e0b550d953167bac03a0ea365c80b42532c7b32842cf74108
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='oauth_device_authorizations' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.oauth_device_authorizations identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."oauth_device_authorizations" TO clawdeals_app;
ALTER TABLE public."oauth_device_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."oauth_device_authorizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."oauth_device_authorizations" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."oauth_device_authorizations" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."oauth_device_authorizations" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.oauth_device_user_code_attempts; kind r; metadata SHA256 80a04851e3047612ce3a28d2bc4fb76aca1045b83be433a07ac7a06e548634ac
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='oauth_device_user_code_attempts' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.oauth_device_user_code_attempts identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."oauth_device_user_code_attempts" TO clawdeals_app;
ALTER TABLE public."oauth_device_user_code_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."oauth_device_user_code_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."oauth_device_user_code_attempts" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."oauth_device_user_code_attempts" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."oauth_device_user_code_attempts" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."oauth_device_user_code_attempts" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.oauth_refresh_tokens; kind r; metadata SHA256 cf105b79e84abb3cdbe27d31860a3a9c8b2e1641eeeb2b61c3984bd3e6c4e9fd
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='oauth_refresh_tokens' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.oauth_refresh_tokens identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."oauth_refresh_tokens" TO clawdeals_app;
ALTER TABLE public."oauth_refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."oauth_refresh_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."oauth_refresh_tokens" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."oauth_refresh_tokens" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."oauth_refresh_tokens" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."oauth_refresh_tokens" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.offers; kind r; metadata SHA256 eeef7db96869d2c1212a296b998982e543319c2a33cd3a620f2c3588ef3830dd
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='offers' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.offers identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."offers" TO clawdeals_app;
ALTER TABLE public."offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."offers" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."offers" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.owner_auth_links; kind r; metadata SHA256 8b0573d3b2fa8a032ae7efb332869cf80beaae5734d670bce8671a64d155a819
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='owner_auth_links' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.owner_auth_links identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."owner_auth_links" TO clawdeals_app;
ALTER TABLE public."owner_auth_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."owner_auth_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."owner_auth_links" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."owner_auth_links" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."owner_auth_links" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.owner_sessions; kind r; metadata SHA256 aa604aca8ec1f947e92d38618a5775c014afcb6114b30017c771c031c4bb6330
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='owner_sessions' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.owner_sessions identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."owner_sessions" TO clawdeals_app;
ALTER TABLE public."owner_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."owner_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."owner_sessions" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."owner_sessions" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."owner_sessions" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.owner_verification_challenges; kind r; metadata SHA256 f346d6599410a9eaba2bc0a97533e04ce49a02f58db8b2c28beee3bcb0953e7b
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='owner_verification_challenges' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.owner_verification_challenges identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."owner_verification_challenges" TO clawdeals_app;
ALTER TABLE public."owner_verification_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."owner_verification_challenges" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."owner_verification_challenges" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."owner_verification_challenges" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."owner_verification_challenges" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.owners; kind r; metadata SHA256 dee51178089f94ddb3f274ea2b72bdf20c635cf39e18f4a7b21a410c86d47f88
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='owners' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.owners identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."owners" TO clawdeals_app;
ALTER TABLE public."owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."owners" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."owners" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."owners" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."owners" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.pairing_tokens; kind r; metadata SHA256 68df666d620c4547b5d1a785f2a0475ed8c7b69d991f6ed1f130558c49481eff
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pairing_tokens' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.pairing_tokens identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."pairing_tokens" TO clawdeals_app;
ALTER TABLE public."pairing_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pairing_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."pairing_tokens" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."pairing_tokens" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."pairing_tokens" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.policies; kind r; metadata SHA256 9eeed67b99d2d0127790bd32b22b37a272b931bf20d0b2b96105d8121efb188f
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='policies' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.policies identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."policies" TO clawdeals_app;
ALTER TABLE public."policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."policies" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."policies" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."policies" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.project_missions; kind r; metadata SHA256 9f88e4d32b57eee546a7bc6adc90a00866efcf174342b9e2574165611b4b188e
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='project_missions' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.project_missions identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."project_missions" TO clawdeals_app;
ALTER TABLE public."project_missions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_missions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."project_missions" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."project_missions" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.psp_accounts; kind r; metadata SHA256 dd30361480436af520847ad0f5f1a40c7be4fe837b1d0af568a6e91c7d0cf1de
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='psp_accounts' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.psp_accounts identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."psp_accounts" TO clawdeals_app;
ALTER TABLE public."psp_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psp_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."psp_accounts" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."psp_accounts" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."psp_accounts" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.psp_config; kind r; metadata SHA256 2888c6c4f32dead3c5ac8b2382ed45e9075d15b5f8793fce7bc59dd275958677
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='psp_config' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.psp_config identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."psp_config" TO clawdeals_app;
ALTER TABLE public."psp_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psp_config" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."psp_config" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."psp_config" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."psp_config" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.psp_webhook_events; kind r; metadata SHA256 cdfbc7661475a21fbfa122aecb3f267f12dc8da528b494cfc174df24115d1c95
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='psp_webhook_events' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.psp_webhook_events identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."psp_webhook_events" TO clawdeals_app;
ALTER TABLE public."psp_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psp_webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."psp_webhook_events" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."psp_webhook_events" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."psp_webhook_events" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.ratings; kind r; metadata SHA256 6fdd6ecbe538ccb114336246a0eb7b7accc81756f97dade9db91903dd221e12d
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ratings' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.ratings identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."ratings" TO clawdeals_app;
ALTER TABLE public."ratings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ratings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."ratings" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."ratings" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.reports; kind r; metadata SHA256 8b9159acf6a07fa7235d5ea99282e849cd1a9f0eeff3127fe50d46a721411d15
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='reports' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.reports identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."reports" TO clawdeals_app;
ALTER TABLE public."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."reports" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."reports" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."reports" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."reports" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.risk_rule_state; kind r; metadata SHA256 3585aad655b45d072bdc1d4fe9a3269f0d8f75b0f98f2dc7d70401bc4d33a419
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='risk_rule_state' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.risk_rule_state identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."risk_rule_state" TO clawdeals_app;
ALTER TABLE public."risk_rule_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."risk_rule_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."risk_rule_state" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."risk_rule_state" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."risk_rule_state" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.risk_rules; kind r; metadata SHA256 ee020d026d6c236b528d5ec4eae6b578d4fe5cb2986a9bf7e28339915073f7e9
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='risk_rules' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.risk_rules identity'; END IF; END $$;
GRANT SELECT, UPDATE ON TABLE public."risk_rules" TO clawdeals_app;
ALTER TABLE public."risk_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."risk_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."risk_rules" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_update" ON public."risk_rules" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.smartphone_passport_photos; kind r; metadata SHA256 1909fabc00d6c6eb40afe56bd4460d7a3496b7fe8fb082a940ecc8c49ac2a64b
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='smartphone_passport_photos' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.smartphone_passport_photos identity'; END IF; END $$;
GRANT SELECT, DELETE ON TABLE public."smartphone_passport_photos" TO clawdeals_app;
ALTER TABLE public."smartphone_passport_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."smartphone_passport_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."smartphone_passport_photos" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_delete" ON public."smartphone_passport_photos" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.smartphone_passports; kind r; metadata SHA256 9edd0dd221399bb20335dc1501ce61bb09de425897f0155089f44a4192262d0f
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='smartphone_passports' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.smartphone_passports identity'; END IF; END $$;
GRANT SELECT ON TABLE public."smartphone_passports" TO clawdeals_app;
ALTER TABLE public."smartphone_passports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."smartphone_passports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."smartphone_passports" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.staged_commands; kind r; metadata SHA256 4a463b53143e51b3acc569764f439c71b8dd3002ee5108c9f693c764a2d366d0
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='staged_commands' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.staged_commands identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."staged_commands" TO clawdeals_app;
ALTER TABLE public."staged_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staged_commands" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."staged_commands" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."staged_commands" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."staged_commands" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.threads; kind r; metadata SHA256 909f31a8fed6b490756c3e393c69b50d8d96697b5af279ed266792dde8d8d1ff
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='threads' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.threads identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."threads" TO clawdeals_app;
ALTER TABLE public."threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."threads" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."threads" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.transactions; kind r; metadata SHA256 c6076600ae10a137146dfa30d570a1a99bbe53c797880b80bc717c35c3c2b368
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='transactions' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.transactions identity'; END IF; END $$;
GRANT SELECT ON TABLE public."transactions" TO clawdeals_app;
ALTER TABLE public."transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."transactions" FOR SELECT TO clawdeals_app USING (true);
-- Source identity public.trustscore_recalc_queue; kind r; metadata SHA256 6d4b2dc230ec69234f578ce9a2edb1a653406735f2745418f925d03b223d2c46
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='trustscore_recalc_queue' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.trustscore_recalc_queue identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."trustscore_recalc_queue" TO clawdeals_app;
ALTER TABLE public."trustscore_recalc_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trustscore_recalc_queue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."trustscore_recalc_queue" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."trustscore_recalc_queue" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."trustscore_recalc_queue" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."trustscore_recalc_queue" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.watchlist_backfill_queue; kind r; metadata SHA256 b22d05271bc6c55be239554b286c3b406fcdd55a5e772840c0e3485240eebe70
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='watchlist_backfill_queue' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.watchlist_backfill_queue identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."watchlist_backfill_queue" TO clawdeals_app;
ALTER TABLE public."watchlist_backfill_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_backfill_queue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."watchlist_backfill_queue" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."watchlist_backfill_queue" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."watchlist_backfill_queue" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."watchlist_backfill_queue" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.watchlist_match_queue; kind r; metadata SHA256 271b5fdae2b86d103ef4cf8e2388a261a8681e9b6ffb34bde34106a6c790b87c
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='watchlist_match_queue' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.watchlist_match_queue identity'; END IF; END $$;
GRANT SELECT, UPDATE, DELETE ON TABLE public."watchlist_match_queue" TO clawdeals_app;
ALTER TABLE public."watchlist_match_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_match_queue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."watchlist_match_queue" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_update" ON public."watchlist_match_queue" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."watchlist_match_queue" FOR DELETE TO clawdeals_app USING (true);
-- Source identity public.watchlist_matches; kind r; metadata SHA256 b401b7219f36f6dc9debb9049e948f20fda8620332451fb9fae0c095cf722d58
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='watchlist_matches' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.watchlist_matches identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE ON TABLE public."watchlist_matches" TO clawdeals_app;
ALTER TABLE public."watchlist_matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_matches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."watchlist_matches" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."watchlist_matches" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."watchlist_matches" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
-- Source identity public.watchlist_signups; kind r; metadata SHA256 8897bad47807fd086a63268d50532a5d472b86fa497f80f67cd4b971052fa700
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='watchlist_signups' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.watchlist_signups identity'; END IF; END $$;
GRANT SELECT, INSERT ON TABLE public."watchlist_signups" TO clawdeals_app;
ALTER TABLE public."watchlist_signups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_signups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."watchlist_signups" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."watchlist_signups" FOR INSERT TO clawdeals_app WITH CHECK (true);
-- Source identity public.watchlists; kind r; metadata SHA256 3a78f6cb9dc0ad72fb9edc4b0f48f991d0797db7996a2238056d78c4a857aae4
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='watchlists' AND c.relkind='r' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.watchlists identity'; END IF; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."watchlists" TO clawdeals_app;
ALTER TABLE public."watchlists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlists" FORCE ROW LEVEL SECURITY;
CREATE POLICY "neon_direct_select" ON public."watchlists" FOR SELECT TO clawdeals_app USING (true);
CREATE POLICY "neon_direct_insert" ON public."watchlists" FOR INSERT TO clawdeals_app WITH CHECK (true);
CREATE POLICY "neon_direct_update" ON public."watchlists" FOR UPDATE TO clawdeals_app USING (true) WITH CHECK (true);
CREATE POLICY "neon_direct_delete" ON public."watchlists" FOR DELETE TO clawdeals_app USING (true);
ROLLBACK; -- Review candidate: actual dump parity and assembled authorization are not approved.
