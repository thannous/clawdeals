import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { getEnv } from "../config/env";

let sql: NeonQueryFunction<false, false> | null = null;

/**
 * Lazily creates the Neon HTTP query client. Keeping initialization lazy means
 * builds and Supabase-backed rollback deployments do not require DATABASE_URL.
 * Callers must use tagged templates or numbered placeholders for all values.
 */
export function getNeonSql(): NeonQueryFunction<false, false> {
  if (sql) return sql;

  const databaseUrl = getEnv("DATABASE_URL", { required: true });
  sql = neon(databaseUrl);
  return sql;
}

export function resetNeonSqlForTests() {
  sql = null;
  roleCheck = undefined;
}

let roleCheck: Promise<void> | undefined;
/** Fail closed before app SQL: role membership can allow SET ROLE even when
 * NOINHERIT suppresses active privileges. TEMP can shadow definer dependencies. */
export async function ensureNeonRuntimeRole() {
  roleCheck ??= (async () => {
    const rows = await getNeonSql().query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolinherit,
      current_user<>session_user AS assumed_role,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects,
      has_database_privilege(current_user,current_database(),'TEMP') AS can_temp,
      pg_has_role(current_user,d.datdba,'MEMBER') AS owns_database,
      EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname<>current_user AND pg_has_role(current_user,p.oid,'MEMBER')) AS elevated_membership,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_tables,
      EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('public','private')
        AND (pg_has_role(current_user,n.nspowner,'MEMBER') OR has_schema_privilege(current_user,n.oid,'CREATE'))) AS owns_schema
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`, []);
    const role = rows[0];
    const flags = ["rolsuper", "rolbypassrls", "rolcreaterole", "rolcreatedb", "rolreplication", "rolinherit", "assumed_role", "can_create_database_objects", "can_temp", "owns_database", "elevated_membership", "owns_tables", "owns_schema"];
    if (!role || flags.some((key) => role[key] !== false)) throw new Error("Neon runtime requires a dedicated non-owner role with NOINHERIT and without role membership, SET ROLE, BYPASSRLS, database/schema CREATE or database TEMP privileges");
  })();
  await roleCheck;
}
