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

async function insertApiKeyRecord({ agentId, keyState, scope, graceExpiresAt }: any) {
  const client = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_KEY_GENERATION_ATTEMPTS; attempt += 1) {
    const { apiKey, prefix, secret } = generateApiKey();
    const keyHash = await hashApiKeySecret(secret);
    const payload = {
      agent_id: agentId,
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

export async function createApiKeyForAgent({ agentId, keyState = "ACTIVE", scope = "full", graceExpiresAt }: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }
  return insertApiKeyRecord({ agentId, keyState, scope, graceExpiresAt });
}

export async function issueApiKey({ agentId, scope = "full", state = "ACTIVE" }: any) {
  return createApiKeyForAgent({ agentId, keyState: state, scope });
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

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("api_keys")
    .select("api_key_id, agent_id, key_hash, key_state, grace_expires_at, revoked_at, agents ( owner_id )")
    .eq("key_prefix", parsed.prefix)
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    return { ok: false, reason: "not_found" };
  }

  const matches = await verifyApiKeySecret(parsed.secret, data.key_hash);
  if (!matches) {
    return { ok: false, reason: "mismatch" };
  }

  if (data.key_state === "REVOKED" || data.revoked_at) {
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

  return {
    ok: true,
    agentId: data.agent_id,
    ownerId: data.agents?.owner_id || null,
    apiKeyId: data.api_key_id,
    keyState: data.key_state
  };
}

export async function rotateApiKeyForAgent({ agentId, graceSeconds = API_KEY_GRACE_SECONDS }: any) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data: keys, error } = await client
    .from("api_keys")
    .select("api_key_id, key_state")
    .eq("agent_id", agentId)
    .in("key_state", ["ACTIVE", "GRACE"]);

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  const activeKey = keys?.find((key) => key.key_state === "ACTIVE");
  if (!activeKey) {
    throw buildServiceError("Active API key not found", 404, "NOT_FOUND");
  }

  const now = new Date();
  const graceExpiresAt = computeGraceExpiry(graceSeconds, now);

  const graceKey = keys?.find((key) => key.key_state === "GRACE");
  if (graceKey) {
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
      graceSeconds
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
    .select("api_key_id, revoked_at")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("API key not found", 404, "NOT_FOUND");
  }

  return data;
}
