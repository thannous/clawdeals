import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const REFRESH_TOKEN_PREFIX = "cd_rt_";
const REFRESH_TOKEN_TTL_DAYS = 30;
const MAX_TOKEN_GENERATION_ATTEMPTS = 5;

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

function requireOauthTokenSecret() {
  const secret =
    process.env.OAUTH_TOKEN_SECRET ||
    process.env.OAUTH_DEVICE_SECRET ||
    process.env.CONNECT_SESSION_SECRET ||
    process.env.CONNECT_SESSIONS_SECRET ||
    process.env.PAIR_TOKEN_SECRET ||
    process.env.PAIRING_CODE_SECRET;

  if (!secret) {
    throw buildServiceError(
      "OAUTH_TOKEN_SECRET (or OAUTH_DEVICE_SECRET/CONNECT_SESSION_SECRET/CONNECT_SESSIONS_SECRET/PAIR_TOKEN_SECRET/PAIRING_CODE_SECRET) is required",
      500,
      "MISSING_SECRET"
    );
  }

  return secret;
}

function hashWithSecret(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

function generateRefreshToken() {
  // base64url(32 bytes) => 43 chars + prefix. High-entropy and URL-safe.
  return `${REFRESH_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function computeRefreshExpiry(now = new Date()) {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function isExpired(expiresAt: any, now = new Date()) {
  const parsed = expiresAt ? new Date(expiresAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= now.getTime();
}

export type OauthRefreshTokenRow = any;

export async function getOauthRefreshTokenRecordByToken({
  refreshToken
}: {
  refreshToken: string;
}): Promise<{ tokenHash: string; record: OauthRefreshTokenRow } | null> {
  const token = normalizeNonEmptyString(refreshToken);
  if (!token) throw buildServiceError("refreshToken is required", 400, "VALIDATION_ERROR");

  const secret = requireOauthTokenSecret();
  const tokenHash = hashWithSecret(token, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("oauth_refresh_tokens").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw mapSupabaseServiceError(error);
  if (!data) return null;
  return { tokenHash, record: data };
}

export async function issueRefreshTokenRecord({
  ownerId,
  agentId,
  installationId,
  scopes,
  now = new Date()
}: {
  ownerId: string;
  agentId: string;
  installationId: string;
  scopes: string[];
  now?: Date;
}): Promise<{
  refresh_token: string;
  token_id: string;
  token_hash: string;
  expires_at: string;
}> {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  const resolvedAgentId = normalizeNonEmptyString(agentId);
  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedOwnerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  if (!resolvedInstallationId) throw buildServiceError("installationId is required", 400, "VALIDATION_ERROR");

  const secret = requireOauthTokenSecret();
  const nowIso = now.toISOString();
  const expiresAt = computeRefreshExpiry(now);

  const client = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
    const refreshToken = generateRefreshToken();
    const tokenHash = hashWithSecret(refreshToken, secret);

    const { data, error } = await client
      .from("oauth_refresh_tokens")
      .insert({
        token_hash: tokenHash,
        owner_id: resolvedOwnerId,
        agent_id: resolvedAgentId,
        installation_id: resolvedInstallationId,
        scopes: normalizeTextArray(scopes),
        created_at: nowIso,
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
        rotated_from_token_id: null
      })
      .select("*")
      .single();

    if (!error) {
      return {
        refresh_token: refreshToken,
        token_id: data.token_id,
        token_hash: data.token_hash,
        expires_at: data.expires_at
      };
    }

    if (isUniqueViolation(error)) {
      continue;
    }

    throw mapSupabaseServiceError(error);
  }

  throw buildServiceError("Failed to generate a unique refresh token", 500, "TOKEN_GENERATION_FAILED");
}

export async function rotateRefreshToken({
  refreshToken,
  now = new Date()
}: {
  refreshToken: string;
  now?: Date;
}): Promise<{
  old_token_id: string;
  new_refresh_token: string;
  new_token_id: string;
  new_token_hash: string;
  new_expires_at: string;
  owner_id: string;
  agent_id: string;
  installation_id: string;
  scopes: string[];
}> {
  const existing = await getOauthRefreshTokenRecordByToken({ refreshToken });
  if (!existing) {
    throw buildServiceError("Invalid refresh token", 401, "invalid_grant");
  }

  const row = existing.record;
  if (row.revoked_at) {
    throw buildServiceError("Invalid refresh token", 401, "invalid_grant");
  }
  if (isExpired(row.expires_at, now)) {
    throw buildServiceError("Invalid refresh token", 401, "invalid_grant");
  }

  const nowIso = now.toISOString();
  const client = getSupabaseServiceClient();

  const ownerId = row.owner_id;
  const agentId = row.agent_id;
  const installationId = row.installation_id;
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];

  const secret = requireOauthTokenSecret();
  const expiresAt = computeRefreshExpiry(now);

  for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
    const nextToken = generateRefreshToken();
    const nextHash = hashWithSecret(nextToken, secret);

    const { data: inserted, error: insertError } = await client
      .from("oauth_refresh_tokens")
      .insert({
        token_hash: nextHash,
        owner_id: ownerId,
        agent_id: agentId,
        installation_id: installationId,
        scopes: normalizeTextArray(scopes),
        created_at: nowIso,
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
        rotated_from_token_id: row.token_id
      })
      .select("*")
      .single();

    if (!insertError) {
      // Revoke the old token after the replacement token exists.
      // This avoids "lockout" if token generation/insert succeeds but revocation fails mid-flight.
      const { data: revoked, error: revokeError } = await client
        .from("oauth_refresh_tokens")
        .update({ revoked_at: nowIso })
        .eq("token_id", row.token_id)
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .select("*")
        .maybeSingle();

      if (!revokeError && !revoked) {
        // Lost the rotation race or token is no longer valid.
        // Best-effort cleanup: don't leave an "orphan" token the client never received.
        try {
          await client.from("oauth_refresh_tokens").delete().eq("token_id", inserted.token_id);
        } catch {
          // ignore
        }
        throw buildServiceError("Invalid refresh token", 401, "invalid_grant");
      }

      if (revokeError) {
        // Fail closed: if we cannot revoke the old token, do not return the replacement token.
        // Best-effort cleanup prevents issuing a second valid refresh token on transient DB issues.
        try {
          await client.from("oauth_refresh_tokens").delete().eq("token_id", inserted.token_id);
        } catch (cleanupError: any) {
          console.error("[oauth] refresh-token cleanup failed after revoke error", {
            inserted_token_id: inserted.token_id,
            code: cleanupError?.code,
            message: cleanupError?.message
          });
        }

        console.warn("[oauth] refresh-token rotation failed; old token revoke unavailable", {
          code: revokeError?.code,
          message: revokeError?.message
        });
        throw buildServiceError("Failed to rotate refresh token", 503, "AUTH_UNAVAILABLE");
      }

      return {
        old_token_id: row.token_id,
        new_refresh_token: nextToken,
        new_token_id: inserted.token_id,
        new_token_hash: inserted.token_hash,
        new_expires_at: inserted.expires_at,
        owner_id: ownerId,
        agent_id: agentId,
        installation_id: installationId,
        scopes
      };
    }

    if (isUniqueViolation(insertError)) {
      continue;
    }

    throw mapSupabaseServiceError(insertError);
  }

  throw buildServiceError("Failed to generate a unique refresh token", 500, "TOKEN_GENERATION_FAILED");
}

export async function revokeRefreshToken({
  refreshToken,
  now = new Date()
}: {
  refreshToken: string;
  now?: Date;
}): Promise<{ found: boolean; revoked: boolean; token_id: string | null; owner_id: string | null; token_hash: string } > {
  const token = normalizeNonEmptyString(refreshToken);
  if (!token) throw buildServiceError("refreshToken is required", 400, "VALIDATION_ERROR");

  const secret = requireOauthTokenSecret();
  const tokenHash = hashWithSecret(token, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("oauth_refresh_tokens")
    .update({ revoked_at: nowIso })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw mapSupabaseServiceError(error);
  if (data) {
    return { found: true, revoked: true, token_id: data.token_id, owner_id: data.owner_id || null, token_hash: tokenHash };
  }

  // Not revoked: either not found or already revoked.
  const { data: existing, error: lookupError } = await client
    .from("oauth_refresh_tokens")
    .select("token_id, owner_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (lookupError) throw mapSupabaseServiceError(lookupError);
  if (!existing) {
    return { found: false, revoked: false, token_id: null, owner_id: null, token_hash: tokenHash };
  }

  return {
    found: true,
    revoked: Boolean(existing.revoked_at),
    token_id: existing.token_id,
    owner_id: existing.owner_id || null,
    token_hash: tokenHash
  };
}
