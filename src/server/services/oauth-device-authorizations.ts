import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const OAUTH_DEVICE_AUTH_TTL_MINUTES = 10;
const DEVICE_CODE_PREFIX = "cd_dev_";
const USER_CODE_LOCKOUT_MAX_FAILED_ATTEMPTS = 5;
const USER_CODE_LOCKOUT_WINDOW_SECONDS = 5 * 60;
const OAUTH_DEVICE_POLL_INTERVAL_SECONDS = 2;
const OAUTH_DEVICE_SLOW_DOWN_INCREMENT_SECONDS = 5;
const OAUTH_DEVICE_POLL_INTERVAL_MAX_SECONDS = 60;

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

function parseIsoDate(value: any): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function positiveInt(value: any, fallback: number, min = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function retryAfterSecondsFromDate(value: any, now = new Date()) {
  const until = parseIsoDate(value);
  if (!until) return 0;
  const deltaMs = until.getTime() - now.getTime();
  if (deltaMs <= 0) return 0;
  return Math.ceil(deltaMs / 1000);
}

function buildUserCodeLockoutState(row: any, now = new Date()) {
  const failedAttempts = Math.max(0, Number(row?.user_code_attempt_count || 0));
  const retryAfterSeconds = retryAfterSecondsFromDate(row?.user_code_locked_until, now);

  return {
    failed_attempts: failedAttempts,
    locked_until: row?.user_code_locked_until || null,
    locked: retryAfterSeconds > 0,
    retry_after_seconds: retryAfterSeconds
  };
}

function buildPollingState(row: any, now = new Date()) {
  const effectiveIntervalSeconds = positiveInt(
    row?.poll_interval_seconds,
    OAUTH_DEVICE_POLL_INTERVAL_SECONDS
  );
  const lastPolledAt = parseIsoDate(row?.last_polled_at);
  const nextAllowedAt =
    lastPolledAt ? new Date(lastPolledAt.getTime() + effectiveIntervalSeconds * 1000) : null;
  const retryAfterSeconds =
    nextAllowedAt && nextAllowedAt.getTime() > now.getTime()
      ? Math.ceil((nextAllowedAt.getTime() - now.getTime()) / 1000)
      : 0;

  return {
    effective_interval_seconds: effectiveIntervalSeconds,
    last_polled_at: row?.last_polled_at || null,
    next_allowed_at: nextAllowedAt ? nextAllowedAt.toISOString() : null,
    poll_too_fast: retryAfterSeconds > 0,
    retry_after_seconds: retryAfterSeconds
  };
}

export async function getOauthUserCodeLockoutState({
  userCode,
  now = new Date()
}: any): Promise<
  | {
      failed_attempts: number;
      locked_until: string | null;
      locked: boolean;
      retry_after_seconds: number;
    }
  | null
> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_user_code_attempts")
    .select("attempt_count,locked_until")
    .eq("user_code_hash", userCodeHash)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    return null;
  }

  return buildUserCodeLockoutState(
    {
      user_code_attempt_count: data.attempt_count,
      user_code_locked_until: data.locked_until
    },
    now
  );
}

export async function incrementOauthUserCodeLookupFailure({
  userCode,
  maxFailedAttempts = USER_CODE_LOCKOUT_MAX_FAILED_ATTEMPTS,
  lockoutWindowSeconds = USER_CODE_LOCKOUT_WINDOW_SECONDS,
  now = new Date()
}: any): Promise<
  | {
      failed_attempts: number;
      locked_until: string | null;
      locked: boolean;
      retry_after_seconds: number;
    }
  | null
> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const resolvedMaxFailedAttempts = positiveInt(maxFailedAttempts, USER_CODE_LOCKOUT_MAX_FAILED_ATTEMPTS);
  const resolvedLockoutWindowSeconds = positiveInt(lockoutWindowSeconds, USER_CODE_LOCKOUT_WINDOW_SECONDS);

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);

  const client = getSupabaseServiceClient();
  const { data: existing, error: lookupError } = await client
    .from("oauth_device_user_code_attempts")
    .select("user_code_hash,attempt_count,locked_until")
    .eq("user_code_hash", userCodeHash)
    .maybeSingle();

  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  const nowIso = now.toISOString();
  const previousAttempts = Math.max(0, Number(existing?.attempt_count || 0));
  const nextAttempts = previousAttempts + 1;
  const lockoutUntil = new Date(now.getTime() + resolvedLockoutWindowSeconds * 1000).toISOString();

  const updatePayload: any = {
    attempt_count: nextAttempts,
    last_failed_at: nowIso,
    updated_at: nowIso
  };
  if (nextAttempts >= resolvedMaxFailedAttempts) {
    updatePayload.locked_until = lockoutUntil;
  } else {
    updatePayload.locked_until = null;
  }

  let row: any = null;
  if (existing) {
    const { data, error } = await client
      .from("oauth_device_user_code_attempts")
      .update(updatePayload)
      .eq("user_code_hash", userCodeHash)
      .select("attempt_count,locked_until")
      .maybeSingle();
    if (error) {
      throw mapSupabaseServiceError(error);
    }
    row = data || { attempt_count: updatePayload.attempt_count, locked_until: updatePayload.locked_until };
  } else {
    const { data, error } = await client
      .from("oauth_device_user_code_attempts")
      .insert({
        user_code_hash: userCodeHash,
        ...updatePayload,
        created_at: nowIso
      })
      .select("attempt_count,locked_until")
      .maybeSingle();
    if (error) {
      throw mapSupabaseServiceError(error);
    }
    row = data || { attempt_count: updatePayload.attempt_count, locked_until: updatePayload.locked_until };
  }

  return {
    ...buildUserCodeLockoutState(
      {
        user_code_attempt_count: row.attempt_count,
        user_code_locked_until: row.locked_until
      },
      now
    )
  };
}

export const incrementOauthUserCodeLookupFailures = incrementOauthUserCodeLookupFailure;

export async function resetOauthUserCodeLookupFailures({
  userCode
}: any): Promise<OauthDeviceAuthorizationRow | null> {
  const normalized = normalizeOauthUserCode(userCode);
  if (!normalized) {
    throw buildServiceError("userCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const userCodeHash = hashWithSecret(normalized, secret);
  const client = getSupabaseServiceClient();
  const { error } = await client
    .from("oauth_device_user_code_attempts")
    .delete()
    .eq("user_code_hash", userCodeHash)
    .select("user_code_hash")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return null;
}

export async function getOauthDeviceCodePollingState({
  deviceCode,
  now = new Date()
}: any): Promise<{
  authorization: OauthDeviceAuthorizationRow;
  effective_interval_seconds: number;
  last_polled_at: string | null;
  next_allowed_at: string | null;
  poll_too_fast: boolean;
  retry_after_seconds: number;
}> {
  const resolved = normalizeNonEmptyString(deviceCode);
  if (!resolved || !resolved.startsWith(DEVICE_CODE_PREFIX)) {
    throw buildServiceError("deviceCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const deviceCodeHash = hashWithSecret(resolved, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .select("*")
    .eq("device_code_hash", deviceCodeHash)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  return {
    authorization: data,
    ...buildPollingState(data, now)
  };
}

export async function recordOauthDeviceCodePoll({
  deviceCode,
  now = new Date()
}: any): Promise<{
  authorization: OauthDeviceAuthorizationRow;
  effective_interval_seconds: number;
  last_polled_at: string | null;
  next_allowed_at: string | null;
  poll_too_fast: boolean;
  retry_after_seconds: number;
}> {
  const resolved = normalizeNonEmptyString(deviceCode);
  if (!resolved || !resolved.startsWith(DEVICE_CODE_PREFIX)) {
    throw buildServiceError("deviceCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const deviceCodeHash = hashWithSecret(resolved, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      last_polled_at: nowIso,
      updated_at: nowIso
    })
    .eq("device_code_hash", deviceCodeHash)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  return {
    authorization: data,
    ...buildPollingState(data, now)
  };
}

export async function slowDownOauthDeviceCodePolling({
  deviceCode,
  incrementSeconds = OAUTH_DEVICE_SLOW_DOWN_INCREMENT_SECONDS,
  maxIntervalSeconds = OAUTH_DEVICE_POLL_INTERVAL_MAX_SECONDS,
  now = new Date()
}: any): Promise<{
  authorization: OauthDeviceAuthorizationRow;
  effective_interval_seconds: number;
  last_polled_at: string | null;
  next_allowed_at: string | null;
  poll_too_fast: boolean;
  retry_after_seconds: number;
}> {
  const resolved = normalizeNonEmptyString(deviceCode);
  if (!resolved || !resolved.startsWith(DEVICE_CODE_PREFIX)) {
    throw buildServiceError("deviceCode is invalid", 400, "VALIDATION_ERROR");
  }

  const resolvedIncrementSeconds = positiveInt(incrementSeconds, OAUTH_DEVICE_SLOW_DOWN_INCREMENT_SECONDS);
  const resolvedMaxIntervalSeconds = positiveInt(maxIntervalSeconds, OAUTH_DEVICE_POLL_INTERVAL_MAX_SECONDS);

  const secret = requireOauthDeviceSecret();
  const deviceCodeHash = hashWithSecret(resolved, secret);

  const client = getSupabaseServiceClient();
  const { data: existing, error: lookupError } = await client
    .from("oauth_device_authorizations")
    .select("*")
    .eq("device_code_hash", deviceCodeHash)
    .maybeSingle();

  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }
  if (!existing) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  const currentInterval = positiveInt(existing.poll_interval_seconds, OAUTH_DEVICE_POLL_INTERVAL_SECONDS);
  const nextInterval = Math.min(resolvedMaxIntervalSeconds, currentInterval + resolvedIncrementSeconds);
  const nowIso = now.toISOString();

  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      poll_interval_seconds: nextInterval,
      last_polled_at: nowIso,
      updated_at: nowIso
    })
    .eq("authorization_id", existing.authorization_id)
    .eq("device_code_hash", deviceCodeHash)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  const authorization = data || {
    ...existing,
    poll_interval_seconds: nextInterval,
    last_polled_at: nowIso,
    updated_at: nowIso
  };

  return {
    authorization,
    ...buildPollingState(authorization, now)
  };
}

function buildLockoutSignal(lockoutState: any) {
  const retryAfterSeconds = Math.max(1, Number(lockoutState?.retry_after_seconds || 0));
  return {
    status: 429,
    code: "DEVICE_AUTHORIZATION_LOCKED",
    message: "Too many attempts. Try again later.",
    retry_after_seconds: retryAfterSeconds,
    details: {
      retry_after_seconds: retryAfterSeconds
    }
  };
}

export async function assertOauthDeviceUserCodeLookupAllowed({
  userCode,
  now = new Date()
}: any): Promise<any | null> {
  try {
    const lockoutState = await getOauthUserCodeLockoutState({ userCode, now });
    if (!lockoutState?.locked) return null;
    return buildLockoutSignal(lockoutState);
  } catch (error: any) {
    // Invalid user-code formats are handled by route validation/lookup and should not block lookup accounting.
    if (error?.code === "VALIDATION_ERROR") return null;
    throw error;
  }
}

export async function recordOauthDeviceUserCodeLookupAttempt({
  userCode,
  matched = false,
  success = false,
  now = new Date()
}: any): Promise<any | null> {
  try {
    if (success && matched) {
      await resetOauthUserCodeLookupFailures({ userCode, now });
      return null;
    }

    const lockoutState = await incrementOauthUserCodeLookupFailure({ userCode, now });
    if (!lockoutState?.locked) return null;
    return buildLockoutSignal(lockoutState);
  } catch (error: any) {
    if (error?.code === "VALIDATION_ERROR") return null;
    throw error;
  }
}

export async function consumeOauthDeviceTokenPollAttempt({
  authorization = null,
  deviceCode,
  now = new Date()
}: any): Promise<any | null> {
  const pollState =
    authorization && typeof authorization === "object"
      ? {
          authorization,
          ...buildPollingState(authorization, now)
        }
      : await getOauthDeviceCodePollingState({ deviceCode, now });

  if (pollState.poll_too_fast) {
    const slowed = await slowDownOauthDeviceCodePolling({ deviceCode, now });
    return {
      status: 400,
      code: "slow_down",
      retry_after_seconds: Math.max(
        1,
        Number(slowed?.retry_after_seconds || pollState.retry_after_seconds || OAUTH_DEVICE_POLL_INTERVAL_SECONDS)
      )
    };
  }

  await recordOauthDeviceCodePoll({ deviceCode, now });
  return null;
}

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

export async function getOauthDeviceAuthorizationByDeviceCode({
  deviceCode,
  now = new Date()
}: any): Promise<OauthDeviceAuthorizationRow> {
  const resolved = normalizeNonEmptyString(deviceCode);
  if (!resolved || !resolved.startsWith(DEVICE_CODE_PREFIX)) {
    throw buildServiceError("deviceCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const deviceCodeHash = hashWithSecret(resolved, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .select("*")
    .eq("device_code_hash", deviceCodeHash)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  // Device-code exchange should still reflect pending expiry in the UI/polling surface.
  // If the request is still PENDING and has expired, mark it EXPIRED.
  if (data.status === "PENDING") {
    return expirePendingIfNeeded({ row: data, userCodeHash: data.user_code_hash, now });
  }

  return data;
}

export async function markOauthDeviceAuthorizationExchanged({
  authorizationId,
  deviceCode,
  now = new Date()
}: any): Promise<OauthDeviceAuthorizationRow> {
  const resolvedAuthId = normalizeNonEmptyString(authorizationId);
  if (!resolvedAuthId) {
    throw buildServiceError("authorizationId is required", 400, "VALIDATION_ERROR");
  }

  const resolvedCode = normalizeNonEmptyString(deviceCode);
  if (!resolvedCode || !resolvedCode.startsWith(DEVICE_CODE_PREFIX)) {
    throw buildServiceError("deviceCode is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requireOauthDeviceSecret();
  const deviceCodeHash = hashWithSecret(resolvedCode, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_device_authorizations")
    .update({
      exchanged_at: nowIso,
      updated_at: nowIso
    })
    .eq("authorization_id", resolvedAuthId)
    .eq("device_code_hash", deviceCodeHash)
    .eq("status", "AUTHORIZED")
    .is("exchanged_at", null)
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
    .eq("authorization_id", resolvedAuthId)
    .maybeSingle();

  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Device authorization not found", 404, "DEVICE_AUTHORIZATION_NOT_FOUND");
  }

  if (existing.exchanged_at) {
    throw buildServiceError("Device code already exchanged", 409, "DEVICE_CODE_ALREADY_EXCHANGED");
  }
  if (existing.status === "DENIED") {
    throw buildServiceError("Device authorization denied", 409, "DEVICE_AUTHORIZATION_DENIED");
  }
  if (existing.status === "EXPIRED") {
    throw buildServiceError("Device authorization expired", 409, "DEVICE_AUTHORIZATION_EXPIRED");
  }

  const expiresAt = existing?.expires_at ? new Date(existing.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired) {
    throw buildServiceError("Device authorization expired", 409, "DEVICE_AUTHORIZATION_EXPIRED");
  }

  throw buildServiceError("Device authorization cannot be exchanged", 409, "DEVICE_AUTHORIZATION_NOT_EXCHANGEABLE");
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
