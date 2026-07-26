import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const CONNECT_SESSION_TTL_MINUTES = 10;

const CLAIM_TOKEN_PREFIX = "cd_claim_";
const POLL_TOKEN_PREFIX = "cd_poll_";

const VERIFICATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VERIFICATION_CODE_WORDS = [
  "reef",
  "pine",
  "moss",
  "cove",
  "dune",
  "fern",
  "echo",
  "ember",
  "tide",
  "lark",
  "cedar",
  "fjord",
  "orbit",
  "prism",
  "quill",
  "raven",
  "sable",
  "topaz",
  "vapor",
  "waltz",
  "yonder",
  "zephyr",
  "atlas",
  "basil",
  "cobalt",
  "drift",
  "garnet",
  "harbor",
  "jungle",
  "kindle",
  "lotus",
  "marble"
];

function buildServiceError(message, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function mapSupabaseServiceError(error) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function normalizeTextArray(value: any) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const str = normalizeNonEmptyString(item);
    if (!str) continue;
    out.push(str);
  }
  return out;
}

function requireConnectSessionSecret() {
  const secret =
    process.env.CONNECT_SESSION_SECRET ||
    process.env.CONNECT_SESSIONS_SECRET ||
    process.env.OWNER_SESSION_SECRET ||
    process.env.OWNER_SESSIONS_SECRET ||
    process.env.OAUTH_TOKEN_SECRET ||
    process.env.OAUTH_DEVICE_SECRET ||
    process.env.PAIR_TOKEN_SECRET ||
    process.env.PAIRING_CODE_SECRET;
  if (!secret) {
    throw buildServiceError(
      "CONNECT_SESSION_SECRET (or CONNECT_SESSIONS_SECRET/OWNER_SESSION_SECRET/OWNER_SESSIONS_SECRET/OAUTH_TOKEN_SECRET/OAUTH_DEVICE_SECRET/PAIR_TOKEN_SECRET/PAIRING_CODE_SECRET) is required",
      500,
      "MISSING_SECRET"
    );
  }
  return secret;
}

function generateToken(prefix: string) {
  // base64url(32 bytes) => 43 chars + prefix. High-entropy and URL-safe.
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

function generateVerificationCode() {
  // Human-friendly backup code (not stored in plaintext).
  // Example format: "reef-X4B2"
  const word = VERIFICATION_CODE_WORDS[crypto.randomBytes(1)[0] % VERIFICATION_CODE_WORDS.length];
  const bytes = crypto.randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += VERIFICATION_CODE_ALPHABET[bytes[i] % VERIFICATION_CODE_ALPHABET.length];
  }
  return `${word}-${suffix}`;
}

export function hashConnectSessionToken(token: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
}

export function hashConnectSessionClaimToken(claimToken: string, secret?: string) {
  const resolvedSecret = secret || requireConnectSessionSecret();
  return hashConnectSessionToken(claimToken, resolvedSecret);
}

export function hashConnectSessionPollToken(pollToken: string, secret?: string) {
  const resolvedSecret = secret || requireConnectSessionSecret();
  return hashConnectSessionToken(pollToken, resolvedSecret);
}

export function hashConnectSessionVerificationCode(verificationCode: string, secret?: string) {
  const resolvedSecret = secret || requireConnectSessionSecret();
  return hashConnectSessionToken(verificationCode, resolvedSecret);
}

export type ConnectSessionRow = any;

export async function createConnectSession({
  requestedAgentName,
  requestedScopes,
  clientType,
  clientVersion,
  acquisitionId,
  expiresAt,
  ipTruncated,
  uaHash,
  now = new Date()
}: any): Promise<{
  session: ConnectSessionRow;
  claim_token: string;
  poll_token: string;
  verification_code: string;
}> {
  const resolvedAgentName = normalizeNonEmptyString(requestedAgentName)?.slice(0, 80);
  if (!resolvedAgentName) {
    throw buildServiceError("requestedAgentName is required", 400, "VALIDATION_ERROR");
  }

  const resolvedScopes = normalizeTextArray(requestedScopes);
  const resolvedClientType = normalizeNonEmptyString(clientType)?.slice(0, 40) || "other";
  const resolvedClientVersion = normalizeNonEmptyString(clientVersion)?.slice(0, 40) || null;
  const resolvedIp = normalizeNonEmptyString(ipTruncated);
  const resolvedUaHash = normalizeNonEmptyString(uaHash)?.slice(0, 128) || null;
  const resolvedAcquisitionId = normalizeNonEmptyString(acquisitionId);

  const resolvedExpiresAt =
    expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
      ? expiresAt
      : new Date(now.getTime() + CONNECT_SESSION_TTL_MINUTES * 60 * 1000);

  const secret = requireConnectSessionSecret();
  const claimToken = generateToken(CLAIM_TOKEN_PREFIX);
  const pollToken = generateToken(POLL_TOKEN_PREFIX);
  const verificationCode = generateVerificationCode();
  const nowIso = now.toISOString();

  const row = {
    session_id: crypto.randomUUID(),
    status: "PENDING_CLAIM",
    requested_agent_name: resolvedAgentName,
    requested_scopes: resolvedScopes,
    client_type: resolvedClientType,
    client_version: resolvedClientVersion,
    acquisition_id: resolvedAcquisitionId,
    poll_token_hash: hashConnectSessionToken(pollToken, secret),
    claim_token_hash: hashConnectSessionToken(claimToken, secret),
    verification_code_hash: hashConnectSessionToken(verificationCode, secret),
    ip_truncated: resolvedIp,
    ua_hash: resolvedUaHash,
    created_at: nowIso,
    updated_at: nowIso,
    expires_at: resolvedExpiresAt.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("connect_sessions").insert(row).select("*").single();
  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return {
    session: data,
    claim_token: claimToken,
    poll_token: pollToken,
    verification_code: verificationCode
  };
}

export async function getConnectSessionForPoll({
  sessionId,
  pollToken,
  now = new Date()
}: any): Promise<ConnectSessionRow> {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");

  const resolvedPollToken = normalizeNonEmptyString(pollToken);
  if (!resolvedPollToken) throw buildServiceError("pollToken is required", 400, "VALIDATION_ERROR");

  const secret = requireConnectSessionSecret();
  const pollTokenHash = hashConnectSessionToken(resolvedPollToken, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("connect_sessions")
    .select("*")
    .eq("session_id", resolvedSessionId)
    .eq("poll_token_hash", pollTokenHash)
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }

  if (!data) {
    const { data: existing, error: lookupError } = await client
      .from("connect_sessions")
      .select("session_id")
      .eq("session_id", resolvedSessionId)
      .maybeSingle();
    if (lookupError) {
      throw mapSupabaseServiceError(lookupError);
    }

    if (existing) {
      throw buildServiceError("Invalid poll token", 401, "UNAUTHORIZED");
    }
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  // Opportunistically flip pending sessions to EXPIRED once past expires_at.
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired && data.status === "PENDING_CLAIM") {
    const nowIso = now.toISOString();
    const { data: expiredRow, error: expireError } = await client
      .from("connect_sessions")
      .update({
        status: "EXPIRED",
        expired_at: nowIso,
        updated_at: nowIso
      })
      .eq("session_id", resolvedSessionId)
      .eq("poll_token_hash", pollTokenHash)
      .eq("status", "PENDING_CLAIM")
      .select("*")
      .maybeSingle();

    if (expireError) {
      throw mapSupabaseServiceError(expireError);
    }
    return expiredRow || data;
  }

  return data;
}

export async function getConnectSessionByClaimToken({
  claimToken,
  now = new Date()
}: any): Promise<ConnectSessionRow> {
  const resolvedClaimToken = normalizeNonEmptyString(claimToken);
  if (!resolvedClaimToken) throw buildServiceError("claimToken is required", 400, "VALIDATION_ERROR");

  const secret = requireConnectSessionSecret();
  const claimTokenHash = hashConnectSessionToken(resolvedClaimToken, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("connect_sessions")
    .select("*")
    .eq("claim_token_hash", claimTokenHash)
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }

  if (!data) {
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  // Opportunistically flip pending sessions to EXPIRED once past expires_at.
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired && data.status === "PENDING_CLAIM") {
    const nowIso = now.toISOString();
    const { data: expiredRow, error: expireError } = await client
      .from("connect_sessions")
      .update({
        status: "EXPIRED",
        expired_at: nowIso,
        updated_at: nowIso
      })
      .eq("session_id", data.session_id)
      .eq("claim_token_hash", claimTokenHash)
      .eq("status", "PENDING_CLAIM")
      .select("*")
      .maybeSingle();

    if (expireError) {
      throw mapSupabaseServiceError(expireError);
    }
    return expiredRow || data;
  }

  return data;
}

export async function claimConnectSession({
  sessionId,
  claimToken,
  ownerId,
  agentId,
  installationId,
  now = new Date()
}: any): Promise<ConnectSessionRow> {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");

  const resolvedClaimToken = normalizeNonEmptyString(claimToken);
  if (!resolvedClaimToken) throw buildServiceError("claimToken is required", 400, "VALIDATION_ERROR");

  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const resolvedAgentId = normalizeNonEmptyString(agentId);
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");

  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  const secret = requireConnectSessionSecret();
  const claimTokenHash = hashConnectSessionToken(resolvedClaimToken, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("connect_sessions")
    .update({
      status: "CLAIMED",
      owner_id: resolvedOwnerId,
      agent_id: resolvedAgentId,
      installation_id: resolvedInstallationId || null,
      claimed_at: nowIso,
      updated_at: nowIso
    })
    .eq("session_id", resolvedSessionId)
    .eq("claim_token_hash", claimTokenHash)
    .eq("status", "PENDING_CLAIM")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  if (data) {
    return data;
  }

  const { data: existing, error: lookupError } = await client
    .from("connect_sessions")
    .select("*")
    .eq("session_id", resolvedSessionId)
    .maybeSingle();
  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  if (existing.claim_token_hash !== claimTokenHash) {
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  if (existing.status === "CLAIMED" || existing.status === "DELIVERED") {
    throw buildServiceError("Connect session already claimed", 409, "SESSION_ALREADY_CLAIMED");
  }

  if (existing.status === "CANCELLED") {
    throw buildServiceError("Connect session cancelled", 409, "SESSION_CANCELLED");
  }

  const expiresAt = existing.expires_at ? new Date(existing.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired) {
    throw buildServiceError("Connect session expired", 409, "SESSION_EXPIRED");
  }

  if (existing.status === "EXPIRED") {
    throw buildServiceError("Connect session expired", 409, "SESSION_EXPIRED");
  }

  throw buildServiceError("Connect session cannot be claimed", 409, "CONNECT_SESSION_NOT_CLAIMABLE");
}

export async function denyConnectSession({
  sessionId,
  claimToken,
  now = new Date()
}: any): Promise<ConnectSessionRow> {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");

  const resolvedClaimToken = normalizeNonEmptyString(claimToken);
  if (!resolvedClaimToken) throw buildServiceError("claimToken is required", 400, "VALIDATION_ERROR");

  const secret = requireConnectSessionSecret();
  const claimTokenHash = hashConnectSessionToken(resolvedClaimToken, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("connect_sessions")
    .update({
      status: "CANCELLED",
      cancelled_at: nowIso,
      updated_at: nowIso
    })
    .eq("session_id", resolvedSessionId)
    .eq("claim_token_hash", claimTokenHash)
    .eq("status", "PENDING_CLAIM")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  if (data) {
    return data;
  }

  const { data: existing, error: lookupError } = await client
    .from("connect_sessions")
    .select("*")
    .eq("session_id", resolvedSessionId)
    .maybeSingle();
  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  if (existing.claim_token_hash !== claimTokenHash) {
    throw buildServiceError("Connect session not found", 404, "CONNECT_SESSION_NOT_FOUND");
  }

  if (existing.status === "CANCELLED") {
    return existing;
  }

  if (existing.status === "CLAIMED" || existing.status === "DELIVERED") {
    throw buildServiceError("Connect session already claimed", 409, "SESSION_ALREADY_CLAIMED");
  }

  const expiresAt = existing.expires_at ? new Date(existing.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired || existing.status === "EXPIRED") {
    throw buildServiceError("Connect session expired", 409, "SESSION_EXPIRED");
  }

  throw buildServiceError("Connect session cannot be denied", 409, "CONNECT_SESSION_NOT_DENIABLE");
}
