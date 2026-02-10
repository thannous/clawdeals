import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { generateApiKey, hashApiKeySecret } from "../utils/api-keys";

const KEY_PREFIX_UNIQUE_CONSTRAINT = "api_keys_key_prefix_unique";
const MAX_KEY_GENERATION_ATTEMPTS = 5;

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function isPrefixCollision(error: any) {
  if (!error?.message) return false;
  return String(error.message).includes(KEY_PREFIX_UNIQUE_CONSTRAINT);
}

export function mapConnectSessionExchangeRpcError(error: any) {
  const message = String(error?.message || "");

  if (/CONNECT_SESSION_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "CONNECT_SESSION_NOT_FOUND", message: "Connect session not found" };
  }

  if (/CONNECT_POLL_TOKEN_INVALID/i.test(message)) {
    return { status: 401, code: "UNAUTHORIZED", message: "Invalid poll token" };
  }

  if (/SESSION_NOT_CLAIMED/i.test(message)) {
    return { status: 409, code: "SESSION_NOT_CLAIMED", message: "Connect session not claimed" };
  }

  if (/SESSION_ALREADY_DELIVERED/i.test(message)) {
    return { status: 409, code: "SESSION_ALREADY_DELIVERED", message: "Connect session already delivered" };
  }

  if (/SESSION_EXPIRED/i.test(message)) {
    return { status: 410, code: "SESSION_EXPIRED", message: "Connect session expired" };
  }

  const validation = /VALIDATION_ERROR:([A-Z_]+)/i.exec(message);
  if (validation) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: { field: validation[1].toUpperCase() }
    };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwConnectSessionExchangeRpcError(error: any) {
  const mapped = mapConnectSessionExchangeRpcError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function exchangeConnectSessionForInstallationApiKey({
  sessionId,
  pollTokenHash,
  requestedScope,
  installation,
  now = new Date()
}: {
  sessionId: string;
  pollTokenHash: string;
  requestedScope: string;
  installation: {
    clientType: string;
    clientVersion: string | null;
    deviceName: string | null;
    fingerprint: string | null;
  };
  now?: Date;
}): Promise<{
  session_id: string;
  status: "DELIVERED";
  agent_id: string;
  owner_id: string | null;
  installation_id: string;
  api_key: string;
  api_key_id: string;
  issued_at: string;
}> {
  const resolvedSessionId = String(sessionId || "").trim();
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const resolvedPollTokenHash = String(pollTokenHash || "").trim();
  if (!resolvedPollTokenHash) {
    throw buildServiceError("pollTokenHash is required", 400, "VALIDATION_ERROR");
  }

  const scope = String(requestedScope || "").trim();
  if (!scope) {
    throw buildServiceError("requestedScope is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();

  for (let attempt = 0; attempt < MAX_KEY_GENERATION_ATTEMPTS; attempt += 1) {
    const { apiKey, prefix, secret } = generateApiKey();
    const keyHash = await hashApiKeySecret(secret);

    const { data, error } = await client
      .rpc("connect_session_exchange_v1", {
        p_session_id: resolvedSessionId,
        p_poll_token_hash: resolvedPollTokenHash,
        p_requested_scope: scope,
        p_client_type: installation?.clientType,
        p_client_version: installation?.clientVersion ?? null,
        p_device_name: installation?.deviceName ?? null,
        p_fingerprint: installation?.fingerprint ?? null,
        p_key_prefix: prefix,
        p_key_hash: keyHash,
        p_now: nowIso
      })
      .single();

    if (!error) {
      return {
        session_id: data.session_id,
        status: data.status,
        agent_id: data.agent_id,
        owner_id: data.owner_id || null,
        installation_id: data.installation_id,
        api_key: apiKey,
        api_key_id: data.api_key_id,
        issued_at: data.issued_at
      };
    }

    if (isPrefixCollision(error)) {
      continue;
    }

    throwConnectSessionExchangeRpcError(error);
  }

  throw buildServiceError("Failed to generate a unique API key", 500, "API_KEY_GENERATION_FAILED");
}

