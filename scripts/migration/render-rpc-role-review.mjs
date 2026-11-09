// Produces review SQL only. Caller persists it; this module never connects/executes.
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
const dedicated = new Set(["queue_drain_claim_v1", "queue_drain_release_v1", "ensure_audit_log_partitions"]);
export function renderRpcRoleReview(review) {
  if (review.format !== "clawdeals-authorization-review-v1" || review.executable !== false || review.restore_eligible !== false) throw new Error("Bound nonexecuting review required");
  const context = review.rendering_context;
  if (!context || !["", "pg_catalog, public", "pg_catalog, public, extensions"].includes(context.search_path) || typeof context.evidence !== "string" || !context.evidence) throw new Error("Explicit bounded catalog rendering context required");
  const rows = review.routines.filter(r => r.disposition === "server-invoker-candidate" && !dedicated.has(r.identity.name));
  if (!rows.length || rows.some(r => r.identity.schema !== "public" || r.source_security_definer || !/^[a-f0-9]{64}$/.test(r.source_definition_sha256))) throw new Error("Exact public invoker definition hashes required");
  const seen = new Set();
  for (const row of rows) { const key = JSON.stringify(row.identity); if (seen.has(key)) throw new Error("Duplicate signature"); seen.add(key); }
  return `-- ROLLBACK-ONLY RPC REVIEW. Independent source catalog ${review.catalog_sha256}.
-- Not same-archive proof; no automatic migration/import integration.
-- Dedicated queue/partition signatures are intentionally excluded.
-- Rendering context pg_catalog,public verified by canonical-routines-v2 artifact
-- SHA e8dc9ea399f44d60ce891f842127d2d97ce6bffcf3c1114be1e6a8a55fefc8ef.
-- Current independent snapshot, not historical search_path or dump derivation.
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
${rows.map(r => ` (${literal(r.identity.name)},${literal(r.identity.identity_arguments)},${literal(r.source_definition_sha256)})`).join(",\n")}
 ) AS reviewed(name,args,definition_sha256) LOOP
  PERFORM pg_catalog.set_config('search_path',${literal(context.search_path)},true);
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
`;
}
