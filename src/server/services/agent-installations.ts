import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { deleteCachedApiKeyAuthRecord } from "./api-key-auth-cache";
import { deleteOauthAccessTokensForInstallation } from "./oauth-access-tokens";

export const INSTALLATIONS_DEFAULT_LIMIT = 50;
export const INSTALLATIONS_MAX_LIMIT = 100;

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

async function listApiKeyPrefixesForInstallation(installationId: string): Promise<string[]> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("api_keys")
    .select("key_prefix")
    .eq("installation_id", installationId);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return (data || [])
    .map((row: any) => (row?.key_prefix ? String(row.key_prefix) : null))
    .filter(Boolean) as string[];
}

async function invalidatePrefixes(prefixes: string[]) {
  const unique = Array.from(new Set(prefixes.filter(Boolean)));
  for (const prefix of unique) {
    try {
      await deleteCachedApiKeyAuthRecord(prefix);
    } catch {
      // Best-effort only: revocation must succeed even if cache invalidation fails.
    }
  }
}

export async function listInstallationsForOwner({ ownerId, limit = INSTALLATIONS_DEFAULT_LIMIT }: any = {}) {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const resolvedLimit = Math.max(
    1,
    Math.min(INSTALLATIONS_MAX_LIMIT, Number.isInteger(limit) ? limit : INSTALLATIONS_DEFAULT_LIMIT)
  );

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .select("installation_id, agent_id, client_type, client_version, status, created_at, last_seen_at, oauth_scopes")
    .eq("owner_id", resolvedOwnerId)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("installation_id", { ascending: false })
    .limit(resolvedLimit);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return data || [];
}

export async function listActiveInstallationsForOwnerAgent({
  ownerId,
  agentId,
  limit = INSTALLATIONS_MAX_LIMIT
}: any = {}) {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const resolvedAgentId = normalizeNonEmptyString(agentId);
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");

  const resolvedLimit = Math.max(
    1,
    Math.min(INSTALLATIONS_MAX_LIMIT, Number.isInteger(limit) ? limit : INSTALLATIONS_MAX_LIMIT)
  );

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .select("installation_id, owner_id, agent_id, status")
    .eq("owner_id", resolvedOwnerId)
    .eq("agent_id", resolvedAgentId)
    .eq("status", "ACTIVE")
    .order("installation_id", { ascending: true })
    .limit(resolvedLimit);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return data || [];
}

export async function getInstallationById(installationId: string) {
  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedInstallationId) throw buildServiceError("installationId is required", 400, "VALIDATION_ERROR");

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .select("installation_id, owner_id, agent_id, status, oauth_scopes, client_type, client_version, created_at, last_seen_at")
    .eq("installation_id", resolvedInstallationId)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return data || null;
}

export function mapRevokeInstallationRpcError(error: any) {
  const message = String(error?.message || "");

  if (/INSTALLATION_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "NOT_FOUND", message: "Installation not found" };
  }

  const validation = /VALIDATION_ERROR:([A-Z_]+)/i.exec(message);
  if (validation) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: { field: validation[1].toUpperCase() }
    };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwRevokeInstallationRpcError(error: any) {
  const mapped = mapRevokeInstallationRpcError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function revokeInstallationForOwner({
  ownerId,
  installationId,
  now = new Date()
}: {
  ownerId: string;
  installationId: string;
  reason?: string | null;
  now?: Date;
}) {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedInstallationId) throw buildServiceError("installationId is required", 400, "VALIDATION_ERROR");

  const nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString();

  let prefixesBefore: string[] = [];
  let prefixesAfter: string[] = [];

  try {
    prefixesBefore = await listApiKeyPrefixesForInstallation(resolvedInstallationId);
  } catch {
    prefixesBefore = [];
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("revoke_installation_v1", {
      p_installation_id: resolvedInstallationId,
      p_owner_id: resolvedOwnerId,
      p_now: nowIso
    })
    .single();

  if (error) {
    throwRevokeInstallationRpcError(error);
  }

  try {
    prefixesAfter = await listApiKeyPrefixesForInstallation(resolvedInstallationId);
  } catch {
    prefixesAfter = [];
  }

  const prefixes = [...prefixesBefore, ...prefixesAfter];
  await invalidatePrefixes(prefixes);
  await deleteOauthAccessTokensForInstallation(resolvedInstallationId);

  return data;
}
