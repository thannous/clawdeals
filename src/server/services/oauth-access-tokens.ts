import crypto from "node:crypto";

import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";

const ACCESS_TOKEN_PREFIX = "cd_at_";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
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

function resolveAccessTokenTtlSeconds() {
  try {
    const raw = getNumberEnv("OAUTH_ACCESS_TOKEN_TTL_SECONDS", { defaultValue: DEFAULT_ACCESS_TOKEN_TTL_SECONDS });
    const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    return Math.max(1, n);
  } catch (error) {
    console.warn("[oauth] invalid OAUTH_ACCESS_TOKEN_TTL_SECONDS; using default", error);
    return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }
}

function generateAccessToken() {
  // base64url(32 bytes) => 43 chars + prefix. High-entropy and URL-safe.
  return `${ACCESS_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function buildRedisKey(accessTokenHash: string) {
  return `auth:oauth:access:v1:${accessTokenHash}`;
}

export function isOauthAccessToken(token: any) {
  return typeof token === "string" && token.startsWith(ACCESS_TOKEN_PREFIX);
}

export async function deleteOauthAccessTokenByHash(accessTokenHash: string) {
  const hash = normalizeNonEmptyString(accessTokenHash);
  if (!hash) return;
  try {
    const redis = getRedis();
    await redis.del(buildRedisKey(hash));
  } catch (error) {
    // Best-effort cleanup only.
    console.warn("[oauth] failed to delete access token from redis", error);
  }
}

export async function issueOauthAccessToken({
  agentId,
  ownerId,
  installationId,
  scopes,
  now = new Date()
}: {
  agentId: string;
  ownerId: string | null;
  installationId: string;
  scopes: string[];
  now?: Date;
}): Promise<{
  access_token: string;
  access_token_hash: string;
  expires_in: number;
  expires_at: string;
  issued_at: string;
}> {
  const resolvedAgentId = normalizeNonEmptyString(agentId);
  if (!resolvedAgentId) throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");

  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedInstallationId) throw buildServiceError("installationId is required", 400, "VALIDATION_ERROR");

  const resolvedOwnerId = normalizeNonEmptyString(ownerId);

  const ttlSeconds = resolveAccessTokenTtlSeconds();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const accessToken = generateAccessToken();
  const secret = requireOauthTokenSecret();
  const accessTokenHash = hashWithSecret(accessToken, secret);
  const key = buildRedisKey(accessTokenHash);

  const payload = JSON.stringify({
    v: 1,
    agent_id: resolvedAgentId,
    owner_id: resolvedOwnerId || null,
    installation_id: resolvedInstallationId,
    scopes: Array.isArray(scopes) ? scopes : [],
    issued_at: issuedAt,
    expires_at: expiresAt
  });

  try {
    const redis = getRedis();
    await redis.set(key, payload, { ex: ttlSeconds });
  } catch (error) {
    throw buildServiceError("Failed to issue access token", 503, "AUTH_UNAVAILABLE");
  }

  return {
    access_token: accessToken,
    access_token_hash: accessTokenHash,
    expires_in: ttlSeconds,
    expires_at: expiresAt,
    issued_at: issuedAt
  };
}

type OauthAccessTokenRecord = {
  v: number;
  agent_id: string;
  owner_id: string | null;
  installation_id: string;
  scopes: string[];
  issued_at: string;
  expires_at: string;
};

function isOauthAccessTokenRecord(value: any): value is OauthAccessTokenRecord {
  if (!value || typeof value !== "object") return false;
  if (value.v !== 1) return false;
  if (typeof value.agent_id !== "string" || !value.agent_id) return false;
  if (value.owner_id !== null && typeof value.owner_id !== "string") return false;
  if (typeof value.installation_id !== "string" || !value.installation_id) return false;
  if (!Array.isArray(value.scopes) || value.scopes.some((s) => typeof s !== "string")) return false;
  if (typeof value.issued_at !== "string" || !value.issued_at) return false;
  if (typeof value.expires_at !== "string" || !value.expires_at) return false;
  return true;
}

export async function authenticateOauthAccessToken(accessToken: string, { now = new Date() } = {}) {
  const token = normalizeNonEmptyString(accessToken);
  if (!token || !isOauthAccessToken(token)) {
    return { ok: false as const, reason: "invalid_format" };
  }

  const secret = requireOauthTokenSecret();
  const accessTokenHash = hashWithSecret(token, secret);
  const key = buildRedisKey(accessTokenHash);

  let raw: any;
  try {
    const redis = getRedis();
    raw = await redis.get(key);
  } catch (error) {
    throw buildServiceError("Failed to validate access token", 503, "AUTH_UNAVAILABLE");
  }

  if (!raw) {
    return { ok: false as const, reason: "not_found" };
  }

  let parsed: any = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return { ok: false as const, reason: "malformed" };
  }

  if (!isOauthAccessTokenRecord(parsed)) {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return { ok: false as const, reason: "malformed" };
  }

  const expiresAt = new Date(parsed.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return { ok: false as const, reason: "expired" };
  }

  return {
    ok: true as const,
    agentId: parsed.agent_id,
    ownerId: parsed.owner_id,
    installationId: parsed.installation_id,
    scopes: parsed.scopes,
    accessTokenHash,
    expiresAt: parsed.expires_at
  };
}
