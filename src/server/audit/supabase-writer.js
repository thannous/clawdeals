import { getSupabaseServiceClient } from "../db/supabase";

export function createSupabaseAuditWriter({ table = "audit_logs" } = {}) {
  return async function writeAuditRow(row) {
    const client = getSupabaseServiceClient();
    const { error } = await client.from(table).insert(row);
    if (error) {
      throw new Error(`Failed to insert audit log: ${error.message}`);
    }
  };
}
