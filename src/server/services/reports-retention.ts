import { parseRetentionDays, computeCutoffDate, restRequest } from "../retention/shared";

const RETENTION_ENV = "REPORTS_RETENTION_DAYS";
const PII_RETENTION_ENV = "REPORTS_PII_RETENTION_DAYS";

const TIME_COLUMN = "created_at";

export async function runReportsRetention({
  env = process.env,
  now = new Date(),
  table = "reports"
}: any = {}) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      skipped: true,
      reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const results: any = {};

  const retentionDays = parseRetentionDays(env[RETENTION_ENV]);
  if (retentionDays) {
    const cutoff = computeCutoffDate(now, retentionDays);
    results.delete = {
      retentionDays,
      cutoff: cutoff.toISOString(),
      ...(await restRequest({
        supabaseUrl,
        serviceRoleKey,
        table,
        timeColumn: TIME_COLUMN,
        cutoff,
        method: "DELETE"
      }))
    };
  }

  const piiDays = parseRetentionDays(env[PII_RETENTION_ENV]);
  if (piiDays) {
    const cutoff = computeCutoffDate(now, piiDays);
    results.pii_redaction = {
      retentionDays: piiDays,
      cutoff: cutoff.toISOString(),
      ...(await restRequest({
        supabaseUrl,
        serviceRoleKey,
        table,
        timeColumn: TIME_COLUMN,
        cutoff,
        method: "PATCH",
        body: { free_text_redacted: null }
      }))
    };
  }

  if (!Object.keys(results).length) {
    return { skipped: true, reason: "No retention env vars configured." };
  }

  return results;
}
