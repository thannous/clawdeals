import crypto from "node:crypto";

import { getNumberEnv } from "../config/env";
import { getSupabaseServiceClient } from "../db/supabase";
import { getRedis } from "../redis/upstash";

const ACCESS_TOKEN_PREFIX = "cd_at_";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ACCESS_TOKEN_INSTALLATION_INDEX_PREFIX = "auth:oauth:access_installation:v1:";

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

function buildInstallationIndexKey(installationId: string) {
  return `${ACCESS_TOKEN_INSTALLATION_INDEX_PREFIX}${installationId}`;
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

async function indexAccessTokenHashByInstallation({
  installationId,
  accessTokenHash,
  ttlSeconds
}: {
  installationId: string;
  accessTokenHash: string;
  ttlSeconds: number;
}) {
  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  const resolvedHash = normalizeNonEmptyString(accessTokenHash);
  if (!resolvedInstallationId || !resolvedHash) return;

  const resolvedTtlSeconds =
    typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds) ? Math.max(1, Math.floor(ttlSeconds)) : 60;

  const key = buildInstallationIndexKey(resolvedInstallationId);
  const redis = getRedis();
  await redis.sadd(key, resolvedHash);
  // Keep the index slightly longer than access token TTL so revocation can delete all active tokens.
  await redis.expire(key, resolvedTtlSeconds + 60);
}

function extractRelation(value: any) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

export async function validateOauthPrincipalState({
  agentId,
  ownerId,
  installationId
}: {
  agentId: string;
  ownerId: string | null;
  installationId: string;
}) {
  const resolvedAgentId = normalizeNonEmptyString(agentId);
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedAgentId || !resolvedOwnerId || !resolvedInstallationId) {
    return { ok: false as const, reason: "revoked" as const };
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .select(
      "installation_id, owner_id, agent_id, status, agents ( id, owner_id, suspended_at ), owners ( owner_id, suspended_at )"
    )
    .eq("installation_id", resolvedInstallationId)
    .eq("agent_id", resolvedAgentId)
    .eq("owner_id", resolvedOwnerId)
    .maybeSingle();

  if (error) {
    throw buildServiceError("Failed to validate OAuth principal", 503, "AUTH_UNAVAILABLE");
  }
  if (!data || String(data.status || "").toUpperCase() !== "ACTIVE") {
    return { ok: false as const, reason: "revoked" as const };
  }

  const agent = extractRelation(data.agents);
  const owner = extractRelation(data.owners);
  if (
    !agent ||
    !owner ||
    normalizeNonEmptyString(agent.id) !== resolvedAgentId ||
    normalizeNonEmptyString(agent.owner_id) !== resolvedOwnerId ||
    normalizeNonEmptyString(owner.owner_id) !== resolvedOwnerId
  ) {
    return { ok: false as const, reason: "revoked" as const };
  }
  if (agent.suspended_at || owner.suspended_at) {
    return { ok: false as const, reason: "principal_suspended" as const };
  }

  return { ok: true as const };
}

export async function deleteOauthAccessTokensForInstallation(installationId: string) {
  const resolvedInstallationId = normalizeNonEmptyString(installationId);
  if (!resolvedInstallationId) return;

  let redis: any;
  try {
    redis = getRedis();
  } catch (error) {
    // Best-effort cleanup only.
    console.warn("[oauth] failed to initialize redis client for access-token purge", error);
    return;
  }

  const indexKey = buildInstallationIndexKey(resolvedInstallationId);

  let hashes: any = null;
  try {
    hashes = await redis.smembers(indexKey);
  } catch (error) {
    // Best-effort cleanup only.
    try {
      await redis.del(indexKey);
    } catch {
      // ignore
    }
    console.warn("[oauth] failed to list access tokens for installation", error);
    return;
  }

  const members = Array.isArray(hashes) ? hashes : [];
  const unique = Array.from(new Set(members.map((h) => String(h)).filter(Boolean)));
  for (const hash of unique) {
    try {
      await redis.del(buildRedisKey(hash));
    } catch (error) {
      // Best-effort cleanup only.
      console.warn("[oauth] failed to delete access token from redis", error);
    }
  }

  try {
    await redis.del(indexKey);
  } catch (error) {
    // Best-effort cleanup only.
    console.warn("[oauth] failed to delete access-token installation index from redis", error);
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

  const principal = await validateOauthPrincipalState({
    agentId: resolvedAgentId,
    ownerId: resolvedOwnerId,
    installationId: resolvedInstallationId
  });
  if (!principal.ok) {
    throw buildServiceError("OAuth principal is not active", 401, "invalid_grant");
  }

  const ttlSeconds = resolveAccessTokenTtlSeconds();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const accessToken = generateAccessToken();
  const secret = requireOauthTokenSecret();
  const accessTokenHash = hashWithSecret(accessToken, secret);
  const key = buildRedisKey(accessTokenHash);

  const payload = {
    v: 1,
    agent_id: resolvedAgentId,
    owner_id: resolvedOwnerId || null,
    installation_id: resolvedInstallationId,
    scopes: Array.isArray(scopes) ? scopes : [],
    issued_at: issuedAt,
    expires_at: expiresAt
  };

  try {
    const redis = getRedis();
    await redis.set(key, payload, { ex: ttlSeconds });
  } catch (error) {
    throw buildServiceError("Failed to issue access token", 503, "AUTH_UNAVAILABLE");
  }

  try {
    await indexAccessTokenHashByInstallation({
      installationId: resolvedInstallationId,
      accessTokenHash,
      ttlSeconds
    });
  } catch {
    // The token value has not been disclosed yet, so compensating deletion is
    // sufficient even if Redis remains unavailable during cleanup.
    await deleteOauthAccessTokenByHash(accessTokenHash);
    throw buildServiceError("Failed to index access token", 503, "AUTH_UNAVAILABLE");
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

export async function getOauthAccessTokenRecordByToken({
  accessToken,
  now = new Date()
}: {
  accessToken: string;
  now?: Date;
}): Promise<{ accessTokenHash: string; record: OauthAccessTokenRecord } | null> {
  const token = normalizeNonEmptyString(accessToken);
  if (!token) throw buildServiceError("accessToken is required", 400, "VALIDATION_ERROR");
  if (!isOauthAccessToken(token)) return null;

  const secret = requireOauthTokenSecret();
  const accessTokenHash = hashWithSecret(token, secret);
  const key = buildRedisKey(accessTokenHash);

  let raw: any;
  try {
    const redis = getRedis();
    raw = await redis.get(key);
  } catch (error) {
    throw buildServiceError("Failed to read access token", 503, "AUTH_UNAVAILABLE");
  }

  if (!raw) return null;

  let parsed: any = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return null;
  }

  if (!isOauthAccessTokenRecord(parsed)) {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return null;
  }

  const expiresAt = new Date(parsed.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return null;
  }

  return { accessTokenHash, record: parsed };
}

export async function revokeOauthAccessToken({
  accessToken,
  now = new Date()
}: {
  accessToken: string;
  now?: Date;
}): Promise<{
  found: boolean;
  revoked: boolean;
  access_token_hash: string | null;
  owner_id: string | null;
  agent_id: string | null;
  installation_id: string | null;
}> {
  const token = normalizeNonEmptyString(accessToken);
  if (!token) throw buildServiceError("accessToken is required", 400, "VALIDATION_ERROR");
  if (!isOauthAccessToken(token)) {
    return {
      found: false,
      revoked: false,
      access_token_hash: null,
      owner_id: null,
      agent_id: null,
      installation_id: null
    };
  }

  const secret = requireOauthTokenSecret();
  const accessTokenHash = hashWithSecret(token, secret);
  const existing = await getOauthAccessTokenRecordByToken({ accessToken: token, now });
  if (!existing) {
    return {
      found: false,
      revoked: false,
      access_token_hash: accessTokenHash,
      owner_id: null,
      agent_id: null,
      installation_id: null
    };
  }

  let revoked = false;
  try {
    const redis = getRedis();
    await redis.del(buildRedisKey(accessTokenHash));
    revoked = true;
  } catch (error) {
    throw buildServiceError("Failed to revoke access token", 503, "AUTH_UNAVAILABLE");
  }

  return {
    found: true,
    revoked,
    access_token_hash: accessTokenHash,
    owner_id: existing.record.owner_id || null,
    agent_id: existing.record.agent_id || null,
    installation_id: existing.record.installation_id || null
  };
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

  const principal = await validateOauthPrincipalState({
    agentId: parsed.agent_id,
    ownerId: parsed.owner_id,
    installationId: parsed.installation_id
  });
  if (!principal.ok) {
    await deleteOauthAccessTokenByHash(accessTokenHash);
    return {
      ok: false as const,
      reason: principal.reason === "principal_suspended" ? "revoked" : principal.reason
    };
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
