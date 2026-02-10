import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function mapSupabaseServiceError(error: any) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function hashFingerprint(value: string) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export type AgentInstallationRow = any;

export async function createAgentInstallation({
  ownerId,
  agentId,
  clientType = "other",
  clientVersion = null,
  deviceName = null,
  fingerprint = null,
  now = new Date()
}: {
  ownerId: string;
  agentId: string;
  clientType?: string;
  clientVersion?: string | null;
  deviceName?: string | null;
  fingerprint?: string | null;
  now?: Date;
}): Promise<AgentInstallationRow> {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  const resolvedAgentId = normalizeNonEmptyString(agentId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");

  const resolvedClientType = normalizeNonEmptyString(clientType)?.slice(0, 40) || "other";
  const resolvedClientVersion = normalizeNonEmptyString(clientVersion)?.slice(0, 40) || null;
  const resolvedDeviceName = normalizeNonEmptyString(deviceName)?.slice(0, 80) || null;
  const resolvedFingerprint = normalizeNonEmptyString(fingerprint);
  const fingerprintHash = resolvedFingerprint ? hashFingerprint(resolvedFingerprint) : null;
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .insert({
      owner_id: resolvedOwnerId,
      agent_id: resolvedAgentId,
      client_type: resolvedClientType,
      client_version: resolvedClientVersion,
      device_name: resolvedDeviceName,
      fingerprint_hash: fingerprintHash,
      status: "ACTIVE",
      created_at: nowIso,
      last_seen_at: nowIso,
      revoked_at: null
    })
    .select("*")
    .single();

  if (error) throw mapSupabaseServiceError(error);
  return data;
}

export async function deleteAgentInstallation(installationId: string) {
  const resolved = normalizeNonEmptyString(installationId);
  if (!resolved) return;
  try {
    const client = getSupabaseServiceClient();
    await client.from("agent_installations").delete().eq("installation_id", resolved);
  } catch (error) {
    // Best-effort cleanup only.
    console.warn("[oauth] failed to delete agent_installation", error);
  }
}

