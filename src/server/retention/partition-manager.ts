import { assertRehearsalEffectAllowed } from "../config/rehearsal";
import { getNeonDataClient } from "../db/neon-client";
import { getRetentionDatabaseBackend, missingRetentionConfiguration } from "./shared";

export async function ensureFuturePartitions({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}) {
  assertRehearsalEffectAllowed("retention/partition-manager");
  if (getRetentionDatabaseBackend(env) === "neon") {
    missingRetentionConfiguration(env);
    const { data, error } = await getNeonDataClient().rpc("ensure_audit_log_partitions", {}).abortSignal(AbortSignal.timeout(20_000));
    if (error) throw Object.assign(new Error(`Audit partition maintenance failed: ${error.message}`), { code: error.code });
    return validateResult(data);
  }
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Partition maintenance requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/ensure_audit_log_partitions`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: "{}",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`Audit partition maintenance failed (HTTP ${response.status}).`);
  }
  const result = await response.json();
  return validateResult(result);
}

function validateResult(result: any) {
  if (!Array.isArray(result?.partitions) || result.partitions.length !== 3 ||
      !result.partitions.every((name: unknown) => typeof name === "string" && /^audit_logs_\d{4}_\d{2}$/.test(name))) {
    throw new Error("Audit partition maintenance returned an invalid result.");
  }
  return result;
}
