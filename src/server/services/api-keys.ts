import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import {
  API_KEY_GRACE_SECONDS,
  computeGraceExpiry,
  generateApiKey,
  hashApiKeySecret,
  parseApiKey,
  verifyApiKeySecret
} from "../utils/api-keys";
import {
  deleteCachedApiKeyAuthRecord,
  getCachedApiKeyAuthRecord,
  setCachedApiKeyAuthRecord
} from "./api-key-auth-cache";

const KEY_PREFIX_UNIQUE_CONSTRAINT = "api_keys_key_prefix_unique";
const MAX_KEY_GENERATION_ATTEMPTS = 5;

function buildServiceError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapSupabaseServiceError(error) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function isPrefixCollision(error) {
  if (!error?.message) return false;
  return error.message.includes(KEY_PREFIX_UNIQUE_CONSTRAINT);
}

async function insertApiKeyRecord({ agentId, installationId = null, keyState, scope, graceExpiresAt }: any) {
  const client = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_KEY_GENERATION_ATTEMPTS; attempt += 1) {
    const { apiKey, prefix, secret } = generateApiKey();
    const keyHash = await hashApiKeySecret(secret);
    const payload = {
      agent_id: agentId,
      installation_id: installationId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_state: keyState,
      scope: scope || "full",
      grace_expires_at: graceExpiresAt ? graceExpiresAt.toISOString() : null
    };

    const { data, error } = await client.from("api_keys").insert(payload).select().single();
    if (!error) {
      return { record: data, apiKey };
    }
    if (isPrefixCollision(error)) {
      continue;
    }
    throw mapSupabaseServiceError(error);
  }

  throw buildServiceError("Failed to generate a unique API key", 500, "API_KEY_GENERATION_FAILED");
}

export async function createApiKeyForAgent({
  agentId,
  installationId = null,
  keyState = "ACTIVE",
  scope = "full",
  graceExpiresAt
}: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }
  return insertApiKeyRecord({ agentId, installationId, keyState, scope, graceExpiresAt });
}

export async function issueApiKey({ agentId, scope = "full", state = "ACTIVE" }: any) {
  return createApiKeyForAgent({ agentId, keyState: state, scope });
}

function resolveGraceSecondsInput(value: any) {
  if (!Number.isInteger(value) || value < 0) {
    throw buildServiceError("graceSeconds must be an integer greater than or equal to 0", 400, "VALIDATION_ERROR");
  }
  return value;
}

async function revokeApiKeyRecord(apiKeyId, now = new Date()) {
  if (!apiKeyId) return;
  try {
    const client = getSupabaseServiceClient();
    await client
      .from("api_keys")
      .update({
        key_state: "REVOKED",
        revoked_at: now.toISOString(),
        grace_expires_at: null
      })
      .eq("api_key_id", apiKeyId)
      .eq("key_state", "GRACE");
  } catch (error) {
    console.error("[auth] failed to revoke expired grace key", error);
  }
}

export async function authenticateApiKey(apiKey) {
  const parsed = parseApiKey(apiKey);
  if (!parsed) {
    return { ok: false, reason: "invalid_format" };
  }

  const prefix = parsed.prefix;

  const cached = await getCachedApiKeyAuthRecord(prefix);
  let cachedSecretMatches = false;
  if (cached) {
    const matches = await verifyApiKeySecret(parsed.secret, cached.key_hash);
    if (!matches) {
      await deleteCachedApiKeyAuthRecord(prefix);
      return { ok: false, reason: "mismatch" };
    }

    cachedSecretMatches = true;

    if (cached.key_state === "REVOKED" || cached.revoked_at) {
      await deleteCachedApiKeyAuthRecord(prefix);
      return { ok: false, reason: "revoked" };
    }

    if (cached.key_state === "GRACE") {
      if (!cached.grace_expires_at) {
        await revokeApiKeyRecord(cached.api_key_id);
        await deleteCachedApiKeyAuthRecord(prefix);
        return { ok: false, reason: "expired" };
      }
      const expiry = new Date(cached.grace_expires_at);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        await revokeApiKeyRecord(cached.api_key_id);
        await deleteCachedApiKeyAuthRecord(prefix);
        return { ok: false, reason: "expired" };
      }
    }

    if (cached.key_state !== "ACTIVE" && cached.key_state !== "GRACE") {
      await deleteCachedApiKeyAuthRecord(prefix);
      return { ok: false, reason: "invalid_state" };
    }
  }

  // A positive cache entry may accelerate secret verification, but it must not
  // authorize mutable key or suspension state. Revocation commits in Postgres
  // independently of Redis invalidation, so always re-read the authoritative row.
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("api_keys")
    .select(
      "api_key_id, agent_id, installation_id, key_hash, key_state, grace_expires_at, revoked_at, agents ( owner_id, suspended_at )"
    )
    .eq("key_prefix", prefix)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    if (cached) {
      await deleteCachedApiKeyAuthRecord(prefix);
    }
    return { ok: false, reason: "not_found" };
  }

  const matches =
    cachedSecretMatches && cached?.api_key_id === data.api_key_id && cached?.key_hash === data.key_hash
      ? true
      : await verifyApiKeySecret(parsed.secret, data.key_hash);
  if (!matches) {
    return { ok: false, reason: "mismatch" };
  }

  if (data.key_state === "REVOKED" || data.revoked_at) {
    if (cached) {
      await deleteCachedApiKeyAuthRecord(prefix);
    }
    return { ok: false, reason: "revoked" };
  }

  if (data.key_state === "GRACE") {
    if (!data.grace_expires_at) {
      await revokeApiKeyRecord(data.api_key_id);
      return { ok: false, reason: "expired" };
    }
    const expiry = new Date(data.grace_expires_at);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      await revokeApiKeyRecord(data.api_key_id);
      return { ok: false, reason: "expired" };
    }
  }

  if (data.key_state !== "ACTIVE" && data.key_state !== "GRACE") {
    return { ok: false, reason: "invalid_state" };
  }

  await setCachedApiKeyAuthRecord(prefix, {
    api_key_id: data.api_key_id,
    agent_id: data.agent_id,
    owner_id: data.agents?.owner_id || null,
    installation_id: data.installation_id || null,
    key_hash: data.key_hash,
    key_state: data.key_state,
    grace_expires_at: data.grace_expires_at || null,
    revoked_at: data.revoked_at || null,
    suspended_at: data.agents?.suspended_at || null
  });

  return {
    ok: true,
    agentId: data.agent_id,
    ownerId: data.agents?.owner_id || null,
    installationId: data.installation_id || null,
    apiKeyId: data.api_key_id,
    keyState: data.key_state,
    suspendedAt: data.agents?.suspended_at || null
  };
}

export async function rotateApiKeyForAgent({ agentId, graceSeconds = API_KEY_GRACE_SECONDS }: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }
  const resolvedGraceSeconds = resolveGraceSecondsInput(graceSeconds);

  const client = getSupabaseServiceClient();
  const { data: keys, error } = await client
    .from("api_keys")
    .select("api_key_id, key_state, key_prefix")
    .eq("agent_id", agentId)
    .in("key_state", ["ACTIVE", "GRACE"])
    // Legacy/global rotation: installation-scoped keys are rotated/revoked via installation-aware APIs.
    .is("installation_id", null);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  const activeKey = keys?.find((key) => key.key_state === "ACTIVE");
  if (!activeKey) {
    throw buildServiceError("Active API key not found", 404, "NOT_FOUND");
  }

  const now = new Date();
  const graceExpiresAt = computeGraceExpiry(resolvedGraceSeconds, now);

  const graceKey = keys?.find((key) => key.key_state === "GRACE");
  if (graceKey) {
    if (graceKey.key_prefix) {
      await deleteCachedApiKeyAuthRecord(graceKey.key_prefix);
    }
    const { error: revokeError } = await client
      .from("api_keys")
      .update({
        key_state: "REVOKED",
        revoked_at: now.toISOString(),
        grace_expires_at: null
      })
      .eq("api_key_id", graceKey.api_key_id)
      .eq("key_state", "GRACE");
    if (revokeError) {
      throw mapSupabaseServiceError(revokeError);
    }
  }

  const { data: updated, error: updateError } = await client
    .from("api_keys")
    .update({
      key_state: "GRACE",
      grace_expires_at: graceExpiresAt.toISOString()
    })
    .eq("api_key_id", activeKey.api_key_id)
    .eq("key_state", "ACTIVE")
    .select("api_key_id")
    .maybeSingle();

  if (updateError) {
    throw mapSupabaseServiceError(updateError);
  }
  if (!updated) {
    throw buildServiceError("API key rotation conflict", 409, "CONFLICT");
  }
  if (activeKey.key_prefix) {
    await deleteCachedApiKeyAuthRecord(activeKey.key_prefix);
  }

  try {
    const created = await createApiKeyForAgent({
      agentId,
      keyState: "ACTIVE",
      scope: "full"
    });

    return {
      apiKey: created.apiKey,
      apiKeyId: created.record.api_key_id,
      previousApiKeyId: activeKey.api_key_id,
      rotatedAt: now,
      graceSeconds: resolvedGraceSeconds
    };
  } catch (error) {
    await client
      .from("api_keys")
      .update({
        key_state: "ACTIVE",
        grace_expires_at: null
      })
      .eq("api_key_id", activeKey.api_key_id)
      .eq("key_state", "GRACE");
    throw error;
  }
}

export async function rotateGlobalApiKeyForAgentIfPresent({
  agentId,
  graceSeconds = API_KEY_GRACE_SECONDS
}: any) {
  try {
    const rotated = await rotateApiKeyForAgent({ agentId, graceSeconds });
    return {
      rotated: true,
      apiKey: rotated.apiKey,
      apiKeyId: rotated.apiKeyId,
      previousApiKeyId: rotated.previousApiKeyId,
      rotatedAt: rotated.rotatedAt,
      graceSeconds: rotated.graceSeconds
    };
  } catch (error: any) {
    if (error?.code === "NOT_FOUND") {
      return {
        rotated: false,
        apiKey: null,
        apiKeyId: null,
        previousApiKeyId: null,
        rotatedAt: null,
        graceSeconds: null
      };
    }
    throw error;
  }
}

export async function revokeGlobalApiKeysForAgent({ agentId, now = new Date() }: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString();

  const { data: existingKeys, error: listError } = await client
    .from("api_keys")
    .select("api_key_id, key_prefix")
    .eq("agent_id", agentId)
    .is("installation_id", null)
    .in("key_state", ["ACTIVE", "GRACE"]);

  if (listError) {
    throw mapSupabaseServiceError(listError);
  }

  if (!Array.isArray(existingKeys) || existingKeys.length === 0) {
    return {
      revokedGlobalKeysCount: 0,
      revokedGlobalApiKeyIds: []
    };
  }

  const { data: revokedRows, error: revokeError } = await client
    .from("api_keys")
    .update({
      key_state: "REVOKED",
      revoked_at: nowIso,
      grace_expires_at: null
    })
    .eq("agent_id", agentId)
    .is("installation_id", null)
    .in("key_state", ["ACTIVE", "GRACE"])
    .select("api_key_id, key_prefix");

  if (revokeError) {
    throw mapSupabaseServiceError(revokeError);
  }

  const revokedGlobalApiKeyIds = Array.from(
    new Set(
      (revokedRows || [])
        .map((row: any) => (row?.api_key_id ? String(row.api_key_id) : null))
        .filter(Boolean)
    )
  ).sort();

  const prefixes = Array.from(
    new Set(
      [...(existingKeys || []), ...(revokedRows || [])]
        .map((row: any) => (row?.key_prefix ? String(row.key_prefix) : null))
        .filter(Boolean)
    )
  );

  for (const prefix of prefixes) {
    try {
      await deleteCachedApiKeyAuthRecord(prefix);
    } catch {
      // Best-effort only: revocation must still succeed if cache invalidation fails.
    }
  }

  return {
    revokedGlobalKeysCount: revokedGlobalApiKeyIds.length,
    revokedGlobalApiKeyIds
  };
}

export async function rotateInstallationApiKeyForOwner({
  ownerId,
  installationId,
  graceSeconds = API_KEY_GRACE_SECONDS
}: any) {
  if (!ownerId) {
    throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  }
  if (!installationId) {
    throw buildServiceError("installationId is required", 400, "VALIDATION_ERROR");
  }
  const resolvedGraceSeconds = resolveGraceSecondsInput(graceSeconds);

  const client = getSupabaseServiceClient();
  const { data: installation, error: installationError } = await client
    .from("agent_installations")
    .select("installation_id, owner_id, agent_id, status")
    .eq("installation_id", installationId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (installationError) {
    throw mapSupabaseServiceError(installationError);
  }
  if (!installation) {
    throw buildServiceError("Installation not found", 404, "NOT_FOUND");
  }

  if (!installation.agent_id) {
    throw buildServiceError("Installation agent is missing", 409, "INSTALLATION_AGENT_REQUIRED");
  }

  const status = String(installation.status || "").toUpperCase();
  if (status === "REVOKED") {
    throw buildServiceError("Installation is revoked", 409, "INSTALLATION_REVOKED");
  }

  const { data: keys, error } = await client
    .from("api_keys")
    .select("api_key_id, key_state, key_prefix, scope")
    .eq("installation_id", installationId)
    .in("key_state", ["ACTIVE", "GRACE"]);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  const activeKey = keys?.find((key) => key.key_state === "ACTIVE");
  if (!activeKey) {
    throw buildServiceError("Active API key not found", 404, "NOT_FOUND");
  }

  const now = new Date();
  const graceKey = keys?.find((key) => key.key_state === "GRACE");
  if (graceKey) {
    if (graceKey.key_prefix) {
      await deleteCachedApiKeyAuthRecord(graceKey.key_prefix);
    }
    const { error: revokeError } = await client
      .from("api_keys")
      .update({
        key_state: "REVOKED",
        revoked_at: now.toISOString(),
        grace_expires_at: null
      })
      .eq("api_key_id", graceKey.api_key_id)
      .eq("key_state", "GRACE");

    if (revokeError) {
      throw mapSupabaseServiceError(revokeError);
    }
  }

  const transitionPatch =
    resolvedGraceSeconds > 0
      ? {
          key_state: "GRACE",
          grace_expires_at: computeGraceExpiry(resolvedGraceSeconds, now).toISOString(),
          revoked_at: null
        }
      : {
          key_state: "REVOKED",
          revoked_at: now.toISOString(),
          grace_expires_at: null
        };

  const previousKeyState = resolvedGraceSeconds > 0 ? "GRACE" : "REVOKED";
  const { data: updated, error: updateError } = await client
    .from("api_keys")
    .update(transitionPatch)
    .eq("api_key_id", activeKey.api_key_id)
    .eq("key_state", "ACTIVE")
    .select("api_key_id")
    .maybeSingle();

  if (updateError) {
    throw mapSupabaseServiceError(updateError);
  }
  if (!updated) {
    throw buildServiceError("API key rotation conflict", 409, "CONFLICT");
  }

  if (activeKey.key_prefix) {
    await deleteCachedApiKeyAuthRecord(activeKey.key_prefix);
  }

  try {
    const created = await createApiKeyForAgent({
      agentId: installation.agent_id,
      installationId,
      keyState: "ACTIVE",
      scope: activeKey.scope || "full"
    });

    return {
      installationId,
      apiKey: created.apiKey,
      apiKeyId: created.record.api_key_id,
      previousApiKeyId: activeKey.api_key_id,
      rotatedAt: now,
      graceSeconds: resolvedGraceSeconds
    };
  } catch (error) {
    await client
      .from("api_keys")
      .update({
        key_state: "ACTIVE",
        revoked_at: null,
        grace_expires_at: null
      })
      .eq("api_key_id", activeKey.api_key_id)
      .eq("key_state", previousKeyState);

    throw error;
  }
}

export async function revokeApiKeyForAgent({ agentId, apiKeyId, revokedAt = new Date() }: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }
  if (!apiKeyId) {
    throw buildServiceError("apiKeyId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("api_keys")
    .update({
      key_state: "REVOKED",
      revoked_at: revokedAt.toISOString(),
      grace_expires_at: null
    })
    .eq("api_key_id", apiKeyId)
    .eq("agent_id", agentId)
    .select("api_key_id, revoked_at, key_prefix")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("API key not found", 404, "NOT_FOUND");
  }

  if (data.key_prefix) {
    await deleteCachedApiKeyAuthRecord(data.key_prefix);
  }

  return data;
}
