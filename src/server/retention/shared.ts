import { getDatabaseBackend } from "../config/backends";
import { getNeonDataClient } from "../db/neon-client";

export function getRetentionDatabaseBackend(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.CLAWDEALS_DATABASE_BACKEND;
  if (!raw) return getDatabaseBackend();
  const backend = raw.trim().toLowerCase();
  if (backend !== "neon" && backend !== "supabase") throw new Error("Invalid CLAWDEALS_DATABASE_BACKEND");
  return backend;
}
export function missingRetentionConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (getRetentionDatabaseBackend(env) === "neon") {
    if (!env.DATABASE_URL) throw new Error("Missing DATABASE_URL for Neon database operations.");
    return null;
  }
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? null : "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.";
}

export function parseRetentionDays(value) {
  if (!value) {
    return null;
  }
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return days;
}

export function computeCutoffDate(now, retentionDays) {
  const windowMs = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - windowMs);
}

export function parseDeletedCount(contentRange) {
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

export async function restRequest({ supabaseUrl, serviceRoleKey, table, timeColumn, method, cutoff, body, env = process.env }: any) {
  if (getRetentionDatabaseBackend(env) === "neon") {
    const client = getNeonDataClient();
    const query = client.from(table);
    if (method !== "DELETE" && method !== "PATCH") throw new Error("Unsupported retention method");
    const mutation = method === "DELETE" ? query.delete() : query.update(body);
    const result = await mutation.lt(timeColumn, cutoff.toISOString()).select("*", { count: "exact", head: true });
    if (result.error) throw Object.assign(new Error(`Retention ${method} on ${table} failed: ${result.error.message}`), { code: result.error.code });
    return { affected: result.count };
  }
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set(timeColumn, `lt.${cutoff.toISOString()}`);
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
    throw new Error(`Retention ${method} on ${table} failed: ${response.status} ${text || response.statusText}`);
  }

  return {
    affected: parseDeletedCount(response.headers.get("content-range"))
  };
}
