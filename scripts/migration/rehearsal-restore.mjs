import { fresh, digest } from "./transfer-contract.mjs";
import { inspectImportSql, splitSqlStatements, stripComments } from "./sql-statements.mjs";
const ident = /^[a-z_][a-z0-9_]{0,62}$/;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

// Static definitions only: excludes autovacuum/statistics and sequence current values.
export const PROVIDER_CATALOG_FINGERPRINT_SQL = `WITH n AS (SELECT oid FROM pg_namespace WHERE nspname='neon_auth'), definitions AS (
 SELECT 'namespace' k, to_jsonb(s)::text v FROM pg_namespace s WHERE oid IN (SELECT oid FROM n)
 UNION ALL SELECT 'class', (to_jsonb(c) - ARRAY['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid'])::text FROM pg_class c WHERE relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'attribute', to_jsonb(a)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'default', to_jsonb(a)::text FROM pg_attrdef a JOIN pg_class c ON c.oid=a.adrelid WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'index', to_jsonb(a)::text FROM pg_index a JOIN pg_class c ON c.oid=a.indexrelid WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'routine', to_jsonb(p)::text FROM pg_proc p WHERE pronamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'type', to_jsonb(t)::text FROM pg_type t WHERE typnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'enum', to_jsonb(e)::text FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'sequence', to_jsonb(s)::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'constraint', to_jsonb(c)::text FROM pg_constraint c WHERE connamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'rewrite', to_jsonb(r)::text FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'trigger', to_jsonb(t)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN (SELECT oid FROM n)
 UNION ALL SELECT 'policy', to_jsonb(p)::text FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace IN (SELECT oid FROM n)
) SELECT md5(COALESCE(string_agg(k || ':' || v, E'\\n' ORDER BY k,v), '')) FROM definitions`;

export function validateRehearsalEvidence(evidence, target, archiveSha, sqlSha) {
  fresh(evidence?.observed_at);
  for (const key of ["project_id", "branch_id"]) if (evidence[key] !== target[key]) throw new Error("Rehearsal target mismatch");
  if (evidence.restore_user !== target.user) throw new Error("Rehearsal administrator mismatch");
  for (const key of ["isolated_rehearsal", "application_writers_disabled", "external_job_runners_disabled", "no_outbound_or_scheduled_jobs", "provider_schemas_untouched"]) if (evidence[key] !== true) throw new Error("Rehearsal isolation evidence required");
  if (evidence.source_archive_sha256 !== archiveSha || evidence.reviewed_sql_sha256 !== sqlSha) throw new Error("Reviewed artifact binding mismatch");
  if (!Array.isArray(evidence.runtime_roles) || !evidence.runtime_roles.length || evidence.runtime_roles.some(r => !ident.test(r) || r === target.user)) throw new Error("Complete distinct runtime role inventory required");
  if (!Array.isArray(evidence.provider_schemas) || evidence.provider_schemas.length > 1) throw new Error("Verified provider metadata required");
  for (const schema of evidence.provider_schemas) {
    if (schema.name !== "neon_auth" || !ident.test(schema.owner) || schema.owner === target.user || schema.provider_owned_verified !== true || !/^[a-f0-9]{32}$/.test(schema.catalog_md5)) throw new Error("Verified provider owner and fingerprint required");
  }
}
export function providerGuard(schemas) {
  const s = schemas[0];
  if (!s) return `IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='neon_auth') THEN RAISE EXCEPTION 'Unexpected provider schema'; END IF;`;
  return `IF NOT EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='neon_auth' AND r.rolname=${literal(s.owner)}) OR (${PROVIDER_CATALOG_FINGERPRINT_SQL}) IS DISTINCT FROM ${literal(s.catalog_md5)} THEN RAISE EXCEPTION 'Provider definition mismatch'; END IF;`;
}
export function emptyTargetGuard(evidence) {
  const names = evidence.provider_schemas.length ? "'public','neon_auth'" : "'public'";
  return `SELECT pg_advisory_xact_lock(14871635);
DO $guard$ BEGIN
${providerGuard(evidence.provider_schemas)}
IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN (${names},'information_schema') AND nspname NOT LIKE 'pg_%') THEN RAISE EXCEPTION 'Unexpected nonempty or additional schema'; END IF;
IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')) OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')) OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private')) THEN RAISE EXCEPTION 'Application target must be empty, including extension objects'; END IF;
IF EXISTS (SELECT 1 FROM pg_extension WHERE extname NOT IN ('plpgsql')) THEN RAISE EXCEPTION 'Existing extensions need separate review'; END IF;
IF EXISTS (SELECT 1 FROM pg_event_trigger) OR EXISTS (SELECT 1 FROM pg_foreign_server) OR EXISTS (SELECT 1 FROM pg_subscription) THEN RAISE EXCEPTION 'External execution configuration refused'; END IF;
END $guard$;`;
}
export const RESTORE_LOCKDOWN = `DO $lockdown$ DECLARE n text; BEGIN
FOREACH n IN ARRAY ARRAY['public','private'] LOOP
 IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=n) THEN
 EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', n);
 EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC', n);
 EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC', n);
 EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', n);
 END IF;
END LOOP;
END $lockdown$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`;

export function runtimeIsolationGuard(roles, providerSchemas) {
  if (roles.some(r => !ident.test(r))) throw new Error("Invalid runtime role");
  const providerOwners = providerSchemas.map(s => literal(s.owner));
  return `DO $isolation$ DECLARE runtime text; rid oid; BEGIN
FOREACH runtime IN ARRAY ARRAY[${roles.map(literal).join(",")}] LOOP
 SELECT oid INTO rid FROM pg_roles WHERE rolname=runtime;
 IF rid IS NULL THEN RAISE EXCEPTION 'Missing declared runtime role'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(rid,r.oid,'MEMBER') AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolname=current_user ${providerOwners.length ? `OR r.rolname IN (${providerOwners.join(",")})` : ""} OR r.oid=(SELECT datdba FROM pg_database WHERE datname=current_database()))) THEN RAISE EXCEPTION 'Runtime role has elevated membership'; END IF;
 IF EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('public','private') AND (pg_has_role(rid,n.nspowner,'MEMBER') OR has_schema_privilege(rid,n.oid,'USAGE,CREATE'))) THEN RAISE EXCEPTION 'Runtime schema access remains'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND (pg_has_role(rid,c.relowner,'MEMBER') OR CASE WHEN c.relkind='S' THEN has_sequence_privilege(rid,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege(rid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(rid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) THEN RAISE EXCEPTION 'Runtime data access remains'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND (pg_has_role(rid,p.proowner,'MEMBER') OR has_function_privilege(rid,p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Runtime routine access remains'; END IF;
END LOOP;
END $isolation$;`;
}
export function rehearsalSqlBlockers(sql) {
  const blockers = inspectImportSql(sql);
  // Rebuilt tooling deliberately refuses executable routines/views/triggers until
  // a reviewed capability-safe rewrite exists. A regex scanner is not a sandbox.
  if (/\b(?:FUNCTION|PROCEDURE|TRIGGER|VIEW|POLICY|RULE|EXTENSION|FOREIGN|SERVER|SUBSCRIPTION|PUBLICATION|TABLESPACE|SECURITY|OWNER|INHERITS|PARTITION|AS\s+SELECT|GENERATED|DEFAULT|CHECK|REFERENCES)\b/i.test(sql)) blockers.push("Executable definitions or dependencies require separate review");
  if (/\b(?:neon_auth|auth|storage|vault|cron|net|realtime)\b/i.test(sql)) blockers.push("Provider reference refused");
  // Even expressions in CREATE INDEX/type input functions could execute code.
  if (/\b(?:INDEX|TYPE|USING|COLLATE|OPTIONS|ATTACH|SET\s+SCHEMA)\b/i.test(sql)) blockers.push("Definition requires a reviewed rewrite");
  try {
    for (const chunk of splitSqlStatements(sql)) {
      const text = stripComments(chunk.sql).trim();
      // Narrow grammar: no expressions, implicit function calls, custom types or
      // non-application object destinations. Expand only with a tested parser.
      const column = '[a-z_][a-z0-9_]*\\s+(?:bigint|integer|int|smallint|text|boolean|uuid|date|timestamp|timestamptz|jsonb|bytea|numeric)(?:\\s+NOT\\s+NULL)?';
      const table = new RegExp('^CREATE TABLE (?:public|private)\\.[a-z_][a-z0-9_]*\\s*\\(\\s*' + column + '(?:\\s*,\\s*' + column + ')*\\s*\\)\\s*;$', 'i');
      const schema = /^CREATE SCHEMA (?:public|private)\s*;$/i;
      const copy = /^COPY (?:public|private)\.[a-z_][a-z0-9_]* \([a-z0-9_, ]+\) FROM stdin\s*;$/i;
      if (!schema.test(text) && !table.test(text) && !(chunk.copy && copy.test(text))) blockers.push("Only reviewed simple application table/schema/COPY grammar is implemented");
    }
  } catch { blockers.push("Malformed SQL"); }
  return [...new Set(blockers)];
}
export function restoreScript(sql, evidence) {
  const blockers = rehearsalSqlBlockers(sql);
  if (blockers.length) throw new Error(`Rehearsal SQL refused: ${blockers.join(", ")}`);
  return `${emptyTargetGuard(evidence)}\n${sql}\n${RESTORE_LOCKDOWN}\n${runtimeIsolationGuard(evidence.runtime_roles, evidence.provider_schemas)}\nDO $after$ BEGIN ${providerGuard(evidence.provider_schemas)} END $after$;\n`;
}
export const evidenceBinding = evidence => digest(Object.fromEntries(Object.entries(evidence).filter(([k]) => k !== "observed_at")));
