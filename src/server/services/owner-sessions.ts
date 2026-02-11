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

export async function createOwnerSession({
  ownerId,
  tokenHash,
  expiresAt,
  maxAttempts = 5,
  ipTruncated,
  uaHash,
  now = new Date()
}: {
  ownerId: string;
  tokenHash: string;
  expiresAt: Date;
  maxAttempts?: number;
  ipTruncated?: string | null;
  uaHash?: string | null;
  now?: Date;
}) {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId) {
    throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  }

  const resolvedTokenHash = normalizeNonEmptyString(tokenHash);
  if (!resolvedTokenHash) {
    throw buildServiceError("tokenHash is required", 400, "VALIDATION_ERROR");
  }

  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw buildServiceError("expiresAt is required", 400, "VALIDATION_ERROR");
  }

  const payload = {
    owner_id: resolvedOwnerId,
    status: "PENDING",
    token_hash: resolvedTokenHash,
    attempt_count: 0,
    max_attempts: Number.isFinite(maxAttempts) ? Math.max(1, Math.floor(maxAttempts)) : 5,
    ip_truncated: normalizeNonEmptyString(ipTruncated),
    ua_hash: normalizeNonEmptyString(uaHash),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("owner_sessions").insert(payload).select("*").single();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data;
}

export async function getOwnerSessionById(sessionId: string) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .select("*")
    .eq("session_id", resolvedSessionId)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function getOwnerSessionByTokenHash(tokenHash: string) {
  const resolvedTokenHash = normalizeNonEmptyString(tokenHash);
  if (!resolvedTokenHash) {
    throw buildServiceError("tokenHash is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .select("*")
    .eq("token_hash", resolvedTokenHash)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function incrementOwnerSessionAttempt(sessionId: string, nextAttemptCount: number, now = new Date()) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const payload = {
    attempt_count: Number.isFinite(nextAttemptCount) ? Math.max(0, Math.floor(nextAttemptCount)) : 0,
    updated_at: now.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .update(payload)
    .eq("session_id", resolvedSessionId)
    .select("*")
    .single();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data;
}

export async function markOwnerSessionActive(sessionId: string, now = new Date()) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const nowIso = now.toISOString();
  const payload = {
    status: "ACTIVE",
    activated_at: nowIso,
    last_used_at: nowIso,
    updated_at: nowIso
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .update(payload)
    .eq("session_id", resolvedSessionId)
    .eq("status", "PENDING")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function markOwnerSessionExpired(sessionId: string, now = new Date()) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const nowIso = now.toISOString();
  const payload = {
    status: "EXPIRED",
    expired_at: nowIso,
    updated_at: nowIso
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .update(payload)
    .eq("session_id", resolvedSessionId)
    .in("status", ["PENDING", "ACTIVE"])
    .lte("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function markOwnerSessionRevoked(sessionId: string, now = new Date()) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const payload = {
    status: "REVOKED",
    revoked_at: now.toISOString(),
    updated_at: now.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .update(payload)
    .eq("session_id", resolvedSessionId)
    .select("*")
    .single();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data;
}

export async function touchOwnerSession(sessionId: string, now = new Date()) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const nowIso = now.toISOString();
  const payload = {
    last_used_at: nowIso,
    updated_at: nowIso
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_sessions")
    .update(payload)
    .eq("session_id", resolvedSessionId)
    .eq("status", "ACTIVE")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}
