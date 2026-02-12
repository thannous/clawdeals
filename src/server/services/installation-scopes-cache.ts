import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

type CachedInstallationScopesRecord = {
  v: number;
  oauth_scopes: string[];
};

const DEFAULT_TTL_SECONDS = 60;

function buildCacheKey(installationId: string) {
  return `auth:installation:oauth_scopes:v1:${installationId}`;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function normalizeTtlSeconds(ttlSeconds: number) {
  if (!Number.isFinite(ttlSeconds)) return DEFAULT_TTL_SECONDS;
  if (ttlSeconds <= 0) return 0; // allow disabling with 0/negative
  return Math.floor(ttlSeconds);
}

function isCachedInstallationScopesRecord(value: any): value is CachedInstallationScopesRecord {
  if (!value || typeof value !== "object") return false;
  if (value.v !== 1) return false;
  if (!Array.isArray(value.oauth_scopes) || value.oauth_scopes.some((s: any) => typeof s !== "string")) return false;
  return true;
}

export function getInstallationScopesCacheTtlSeconds() {
  try {
    const raw =
      getNumberEnv("INSTALLATION_SCOPES_CACHE_TTL_SECONDS", { defaultValue: DEFAULT_TTL_SECONDS }) ??
      DEFAULT_TTL_SECONDS;
    return normalizeTtlSeconds(raw);
  } catch (error) {
    console.warn("[scopes] invalid INSTALLATION_SCOPES_CACHE_TTL_SECONDS; using default", error);
    return DEFAULT_TTL_SECONDS;
  }
}

export async function getCachedInstallationOauthScopes(installationId: string): Promise<string[] | null> {
  const id = normalizeNonEmptyString(installationId);
  if (!id) return null;
  if (getInstallationScopesCacheTtlSeconds() <= 0) return null;

  try {
    const redis = getRedis();
    const key = buildCacheKey(id);
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

    if (!isCachedInstallationScopesRecord(parsed)) {
      await redis.del(key);
      return null;
    }

    return parsed.oauth_scopes;
  } catch (error) {
    console.warn("[scopes] installation scopes cache read failed; continuing without cache", error);
    return null;
  }
}

export async function setCachedInstallationOauthScopes(
  installationId: string,
  scopes: string[],
  ttlSeconds = getInstallationScopesCacheTtlSeconds()
) {
  const id = normalizeNonEmptyString(installationId);
  if (!id) return;
  if (ttlSeconds <= 0) return;
  if (!Array.isArray(scopes)) return;

  try {
    const redis = getRedis();
    const key = buildCacheKey(id);
    const payload = JSON.stringify({ v: 1, oauth_scopes: scopes });
    await redis.set(key, payload, { ex: ttlSeconds });
  } catch (error) {
    console.warn("[scopes] installation scopes cache write failed; continuing without cache", error);
  }
}

export async function deleteCachedInstallationOauthScopes(installationId: string) {
  const id = normalizeNonEmptyString(installationId);
  if (!id) return;
  try {
    const redis = getRedis();
    await redis.del(buildCacheKey(id));
  } catch (error) {
    console.warn("[scopes] installation scopes cache delete failed; continuing", error);
  }
}

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapSupabaseServiceError(error: any) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

export async function getInstallationOauthScopes(installationId: string): Promise<string[]> {
  const id = normalizeNonEmptyString(installationId);
  if (!id) return [];

  const cached = await getCachedInstallationOauthScopes(id);
  if (cached) return cached;

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agent_installations")
    .select("oauth_scopes")
    .eq("installation_id", id)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  const scopes = Array.isArray(data?.oauth_scopes) ? data.oauth_scopes : [];
  await setCachedInstallationOauthScopes(id, scopes);
  return scopes;
}
