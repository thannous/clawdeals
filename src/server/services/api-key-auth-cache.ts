import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";

export type CachedApiKeyAuthRecord = {
  api_key_id: string;
  agent_id: string;
  owner_id: string | null;
  installation_id: string | null;
  key_hash: string;
  key_state: string;
  grace_expires_at: string | null;
  revoked_at: string | null;
  suspended_at?: string | null;
};

const DEFAULT_TTL_SECONDS = 60;

function buildCacheKey(prefix: string) {
  return `auth:api_key_prefix:${prefix}`;
}

function normalizeTtlSeconds(ttlSeconds: number) {
  if (!Number.isFinite(ttlSeconds)) return DEFAULT_TTL_SECONDS;
  if (ttlSeconds <= 0) return 0; // allow disabling the cache with 0/negative
  return Math.floor(ttlSeconds);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCachedApiKeyAuthRecord(value: unknown): value is CachedApiKeyAuthRecord {
  if (!value || typeof value !== "object") return false;
  const v: any = value;
  return (
    typeof v.api_key_id === "string" &&
    v.api_key_id.length > 0 &&
    typeof v.agent_id === "string" &&
    v.agent_id.length > 0 &&
    isStringOrNull(v.owner_id) &&
    isStringOrNull(v.installation_id) &&
    typeof v.key_hash === "string" &&
    v.key_hash.length > 0 &&
    typeof v.key_state === "string" &&
    v.key_state.length > 0 &&
    isStringOrNull(v.grace_expires_at) &&
    isStringOrNull(v.revoked_at)
  );
}

export function getApiKeyAuthCacheTtlSeconds() {
  try {
    const raw =
      getNumberEnv("API_KEY_LOOKUP_CACHE_TTL_SECONDS", { defaultValue: DEFAULT_TTL_SECONDS }) ?? DEFAULT_TTL_SECONDS;
    return normalizeTtlSeconds(raw);
  } catch (error) {
    // Best-effort cache: misconfiguration must not take down authentication.
    console.warn("[auth] invalid API_KEY_LOOKUP_CACHE_TTL_SECONDS; using default", error);
    return DEFAULT_TTL_SECONDS;
  }
}

export async function getCachedApiKeyAuthRecord(prefix: string): Promise<CachedApiKeyAuthRecord | null> {
  if (!prefix) return null;
  if (getApiKeyAuthCacheTtlSeconds() <= 0) return null;
  try {
    const redis = getRedis();
    const key = buildCacheKey(prefix);
    const raw = await redis.get(key);
    if (!raw) return null;

    let parsed: any = null;
    try {
      // @upstash/redis may automatically JSON-deserialize values.
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await redis.del(key);
      return null;
    }

    if (!isCachedApiKeyAuthRecord(parsed)) {
      await redis.del(key);
      return null;
    }

    return parsed;
  } catch (error) {
    // Best-effort cache: auth must still work if Redis is down/misconfigured.
    console.warn("[auth] api key auth cache read failed; continuing without cache", error);
    return null;
  }
}

export async function setCachedApiKeyAuthRecord(
  prefix: string,
  record: CachedApiKeyAuthRecord,
  ttlSeconds = getApiKeyAuthCacheTtlSeconds()
) {
  if (!prefix) return;
  if (!record) return;
  if (ttlSeconds <= 0) return;
  try {
    const redis = getRedis();
    const key = buildCacheKey(prefix);
    const payload = JSON.stringify(record);
    await redis.set(key, payload, { ex: ttlSeconds });
  } catch (error) {
    // Best-effort cache: failures must not break otherwise-valid authentication.
    console.warn("[auth] api key auth cache write failed; continuing without cache", error);
  }
}

export async function deleteCachedApiKeyAuthRecord(prefix: string) {
  if (!prefix) return;
  try {
    const redis = getRedis();
    await redis.del(buildCacheKey(prefix));
  } catch (error) {
    // Best-effort cache: do not fail requests just because invalidation failed.
    console.warn("[auth] api key auth cache delete failed; continuing", error);
  }
}
