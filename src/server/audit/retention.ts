const RETENTION_ENV = "AUDIT_RETENTION_DAYS";
const PAYLOAD_RETENTION_ENV = "AUDIT_PAYLOAD_RETENTION_DAYS";
const IP_RETENTION_ENV = "AUDIT_IP_FULL_RETENTION_DAYS";
const UA_RETENTION_ENV = "AUDIT_USER_AGENT_RETENTION_DAYS";

function parseRetentionDays(value) {
  if (!value) {
    return null;
  }
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return days;
}

function computeCutoffDate(now, retentionDays) {
  const windowMs = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - windowMs);
}

function parseDeletedCount(contentRange) {
  if (!contentRange) {
    return null;
  }
  const parts = contentRange.split("/");
  if (parts.length !== 2) {
    return null;
  }
  const count = Number.parseInt(parts[1], 10);
  return Number.isFinite(count) ? count : null;
}

async function restRequest({ supabaseUrl, serviceRoleKey, table, method, cutoff, body }: any) {
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set("occurred_at", `lt.${cutoff.toISOString()}`);
  url.searchParams.set("select", "id");

  const response = await fetch(url.toString(), {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "count=exact,return=minimal",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Audit retention ${method} failed: ${response.status} ${text || response.statusText}`);
  }

  return {
    affected: parseDeletedCount(response.headers.get("content-range"))
  };
}

async function deleteAuditLogs({ supabaseUrl, serviceRoleKey, table, cutoff }: any) {
  return restRequest({
    supabaseUrl,
    serviceRoleKey,
    table,
    cutoff,
    method: "DELETE"
  });
}

async function updateAuditLogs({ supabaseUrl, serviceRoleKey, table, cutoff, updates }: any) {
  return restRequest({
    supabaseUrl,
    serviceRoleKey,
    table,
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
