import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";

export type CachedApiKeyAuthRecord = {
  api_key_id: string;
  agent_id: string;
  owner_id: string | null;
  key_hash: string;
  key_state: string;
  grace_expires_at: string | null;
  revoked_at: string | null;
};

const DEFAULT_TTL_SECONDS = 60;

function buildCacheKey(prefix: string) {
  return `auth:api_key_prefix:${prefix}`;
}

export function getApiKeyAuthCacheTtlSeconds() {
  return (
    getNumberEnv("API_KEY_LOOKUP_CACHE_TTL_SECONDS", { defaultValue: DEFAULT_TTL_SECONDS }) ?? DEFAULT_TTL_SECONDS
  );
}

export async function getCachedApiKeyAuthRecord(prefix: string): Promise<CachedApiKeyAuthRecord | null> {
  if (!prefix) return null;
  try {
    const redis = getRedis();
    const raw = await redis.get(buildCacheKey(prefix));
    if (!raw) return null;
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as CachedApiKeyAuthRecord;
    } catch {
      return null;
    }
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
