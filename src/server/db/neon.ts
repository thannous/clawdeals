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
}
