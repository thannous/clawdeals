import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const OAUTH_DEVICE_AUTH_TTL_MINUTES = 10;
const DEVICE_CODE_PREFIX = "cd_dev_";

// Non-ambiguous alphabet (no I/O/1/0).
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_SET = new Set(USER_CODE_ALPHABET.split(""));
const USER_CODE_LENGTH = 8;
const MAX_CODE_GENERATION_ATTEMPTS = 10;

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

function isUniqueViolation(error: any) {
  const code = error?.code;
  if (code === "23505") return true;
  const msg = String(error?.message || "");
  return /duplicate key value/i.test(msg);
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

function requireOauthDeviceSecret() {
  const secret =
    process.env.OAUTH_DEVICE_SECRET ||
    process.env.CONNECT_SESSION_SECRET ||
    process.env.CONNECT_SESSIONS_SECRET ||
    process.env.PAIR_TOKEN_SECRET ||
    process.env.PAIRING_CODE_SECRET;

  if (!secret) {
    throw buildServiceError(
      "OAUTH_DEVICE_SECRET (or CONNECT_SESSION_SECRET/CONNECT_SESSIONS_SECRET/PAIR_TOKEN_SECRET/PAIRING_CODE_SECRET) is required",
      500,
      "MISSING_SECRET"
    );
  }

  return secret;
}

function hashWithSecret(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

function generateDeviceCode() {
  // base64url(32 bytes) => 43 chars + prefix. High-entropy and URL-safe.
  return `${DEVICE_CODE_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function generateUserCode() {
  const bytes = crypto.randomBytes(USER_CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < USER_CODE_LENGTH; i += 1) {
    raw += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeOauthUserCode(value: any): string | null {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return null;

  const compact = raw
    .toUpperCase()
    // Accept common separators but ensure canonical storage/lookup.
    .replace(/[^A-Z0-9]/g, "");

  if (compact.length !== USER_CODE_LENGTH) return null;

  for (const ch of compact) {
    if (!USER_CODE_SET.has(ch)) return null;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export type OauthDeviceAuthorizationRow = any;

export async function createOauthDeviceAuthorization({
  clientId,
  requestedScopes,
  requestedAgentName,
  ipTruncated,
  uaHash,
  expiresAt,
  now = new Date()
}: any): Promise<{
  authorization: OauthDeviceAuthorizationRow;
  device_code: string;
  user_code: string;
}> {
  const resolvedClientId = normalizeNonEmptyString(clientId)?.slice(0, 80);
  if (!resolvedClientId) {
    throw buildServiceError("clientId is required", 400, "VALIDATION_ERROR");
  }

  const scopes = normalizeTextArray(requestedScopes);
  const resolvedRequestedAgentName = normalizeNonEmptyString(requestedAgentName)?.slice(0, 80) || null;
  const resolvedIp = normalizeNonEmptyString(ipTruncated);
  const resolvedUaHash = normalizeNonEmptyString(uaHash)?.slice(0, 128) || null;

  const resolvedExpiresAt =
    expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
      ? expiresAt
      : new Date(now.getTime() + OAUTH_DEVICE_AUTH_TTL_MINUTES * 60 * 1000);

  const secret = requireOauthDeviceSecret();
  const nowIso = now.toISOString();
  const expiresIso = resolvedExpiresAt.toISOString();

  const client = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();

    const row = {
      status: "PENDING",
      client_id: resolvedClientId,
      requested_scopes: scopes,
      requested_agent_name: resolvedRequestedAgentName,
      device_code_hash: hashWithSecret(deviceCode, secret),
      user_code_hash: hashWithSecret(userCode, secret),
      ip_truncated: resolvedIp,
      ua_hash: resolvedUaHash,
      created_at: nowIso,
      updated_at: nowIso,
      expires_at: expiresIso
    };

    const { data, error } = await client
      .from("oauth_device_authorizations")
      .insert(row)
      .select("*")
      .single();

    if (!error) {
      return { authorization: data, device_code: deviceCode, user_code: userCode };
    }

    if (isUniqueViolation(error)) {
      // Rare collisions on short user codes, or extremely unlikely device_code collisions.
      continue;
    }

    throw mapSupabaseServiceError(error);
  }

  throw buildServiceError("Failed to generate unique device authorization codes", 500, "CODE_GENERATION_FAILED");
}

async function expirePendingIfNeeded({
  row,
  userCodeHash,
  now = new Date()
}: {
  row: any;
  userCodeHash: string;
  now?: Date;
}): Promise<any> {
  const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (!expired) return row;

  if (row.status !== "PENDING") return row;

  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();

  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      status: "EXPIRED",
      expired_at: nowIso,
      updated_at: nowIso
    })
    .eq("authorization_id", row.authorization_id)
    .eq("user_code_hash", userCodeHash)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return data || row;
}

export async function getOauthDeviceAuthorizationByUserCode({
  userCode,
  now = new Date()
}: any): Promise<OauthDeviceAuthorizationRow> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .select("*")
    .eq("user_code_hash", userCodeHash)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  return expirePendingIfNeeded({ row: data, userCodeHash, now });
}

export async function approveOauthDeviceAuthorization({
  userCode,
  ownerId,
  agentId,
  now = new Date()
}: any): Promise<OauthDeviceAuthorizationRow> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  const resolvedAgentId = normalizeNonEmptyString(agentId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      status: "AUTHORIZED",
      owner_id: resolvedOwnerId,
      agent_id: resolvedAgentId,
      authorized_at: nowIso,
      updated_at: nowIso
    })
    .eq("user_code_hash", userCodeHash)
    .eq("status", "PENDING")
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
    .from("oauth_device_authorizations")
    .select("*")
    .eq("user_code_hash", userCodeHash)
    .maybeSingle();

  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  const expiredRow = await expirePendingIfNeeded({ row: existing, userCodeHash, now });
  if (expiredRow.status === "EXPIRED") {
    throw buildServiceError("Device authorization expired", 409, "DEVICE_AUTHORIZATION_EXPIRED");
  }
  if (expiredRow.status === "DENIED") {
    throw buildServiceError("Device authorization denied", 409, "DEVICE_AUTHORIZATION_DENIED");
  }
  if (expiredRow.status === "AUTHORIZED") {
    throw buildServiceError("Device authorization already authorized", 409, "DEVICE_AUTHORIZATION_ALREADY_AUTHORIZED");
  }

  throw buildServiceError("Device authorization cannot be approved", 409, "DEVICE_AUTHORIZATION_NOT_APPROVABLE");
}

export async function denyOauthDeviceAuthorization({
  userCode,
  now = new Date()
}: any): Promise<OauthDeviceAuthorizationRow> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      status: "DENIED",
      denied_at: nowIso,
      updated_at: nowIso
    })
    .eq("user_code_hash", userCodeHash)
    .eq("status", "PENDING")
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
    .from("oauth_device_authorizations")
    .select("*")
    .eq("user_code_hash", userCodeHash)
    .maybeSingle();

  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  const expiredRow = await expirePendingIfNeeded({ row: existing, userCodeHash, now });
  if (expiredRow.status === "DENIED") {
    // Idempotent: repeated denies are ok.
    return expiredRow;
  }
  if (expiredRow.status === "EXPIRED") {
    throw buildServiceError("Device authorization expired", 409, "DEVICE_AUTHORIZATION_EXPIRED");
  }
  if (expiredRow.status === "AUTHORIZED") {
    throw buildServiceError("Device authorization already authorized", 409, "DEVICE_AUTHORIZATION_ALREADY_AUTHORIZED");
  }

  throw buildServiceError("Device authorization cannot be denied", 409, "DEVICE_AUTHORIZATION_NOT_DENIABLE");
}

