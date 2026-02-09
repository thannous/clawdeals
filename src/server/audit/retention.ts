import { parseRetentionDays, computeCutoffDate, restRequest } from "../retention/shared";

const RETENTION_ENV = "AUDIT_RETENTION_DAYS";
const PAYLOAD_RETENTION_ENV = "AUDIT_PAYLOAD_RETENTION_DAYS";
const IP_RETENTION_ENV = "AUDIT_IP_FULL_RETENTION_DAYS";
const UA_RETENTION_ENV = "AUDIT_USER_AGENT_RETENTION_DAYS";

const TIME_COLUMN = "occurred_at";

async function deleteAuditLogs({ supabaseUrl, serviceRoleKey, table, cutoff }: any) {
  return restRequest({
    supabaseUrl,
    serviceRoleKey,
    table,
    timeColumn: TIME_COLUMN,
    cutoff,
    method: "DELETE"
  });
}

async function updateAuditLogs({ supabaseUrl, serviceRoleKey, table, cutoff, updates }: any) {
  return restRequest({
    supabaseUrl,
    serviceRoleKey,
    table,
    timeColumn: TIME_COLUMN,
    cutoff,
    method: "PATCH",
    body: updates
  });
}

export async function runAuditRetention({
  env = process.env,
  now = new Date(),
  table = "audit_logs"
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
      ...(await deleteAuditLogs({ supabaseUrl, serviceRoleKey, table, cutoff }))
    };
  }

  const payloadDays = parseRetentionDays(env[PAYLOAD_RETENTION_ENV]);
  if (payloadDays) {
    const cutoff = computeCutoffDate(now, payloadDays);
    results.payload = {
      retentionDays: payloadDays,
      cutoff: cutoff.toISOString(),
      ...(await updateAuditLogs({
        supabaseUrl,
        serviceRoleKey,
        table,
        cutoff,
        updates: { payload: {}, redacted: true }
      }))
    };
  }

  const ipDays = parseRetentionDays(env[IP_RETENTION_ENV]);
  if (ipDays) {
    const cutoff = computeCutoffDate(now, ipDays);
    results.ip_full = {
      retentionDays: ipDays,
      cutoff: cutoff.toISOString(),
      ...(await updateAuditLogs({
        supabaseUrl,
        serviceRoleKey,
        table,
        cutoff,
        updates: { ip_full: null }
      }))
    };
  }

  const uaDays = parseRetentionDays(env[UA_RETENTION_ENV]);
  if (uaDays) {
    const cutoff = computeCutoffDate(now, uaDays);
    results.user_agent = {
      retentionDays: uaDays,
      cutoff: cutoff.toISOString(),
      ...(await updateAuditLogs({
        supabaseUrl,
        serviceRoleKey,
        table,
        cutoff,
        updates: { user_agent: null }
      }))
    };
  }

  if (!Object.keys(results).length) {
    return { skipped: true, reason: "No retention env vars configured." };
  }

  return results;
}
