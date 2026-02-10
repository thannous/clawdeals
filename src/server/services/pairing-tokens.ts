import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const TOKEN_TTL_MINUTES = 10;

const TOKEN_TYPES = new Set(["WEB_TO_CHANNEL", "CHANNEL_TO_WEB"]);

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

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function requirePairTokenSecret() {
  const secret = process.env.PAIR_TOKEN_SECRET || process.env.PAIRING_CODE_SECRET;
  if (!secret) {
    throw buildServiceError("PAIR_TOKEN_SECRET (or PAIRING_CODE_SECRET) is required", 500, "MISSING_SECRET");
  }
  return secret;
}

function generatePairToken() {
  // Keep it short enough for Telegram deep-links; base64url(32 bytes) => 43 chars.
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
}

export type PairingTokenRow = any;

export async function createPairToken({
  tokenType,
  ownerId,
  channelType,
  channelUserId,
  channelContextId,
  displayName,
  now = new Date()
}: any): Promise<{ pair_token: string; expires_at: string; token_type: string }> {
  const resolvedType = normalizeNonEmptyString(tokenType);
  if (!resolvedType || !TOKEN_TYPES.has(resolvedType)) {
    throw buildServiceError("tokenType is invalid", 400, "VALIDATION_ERROR");
  }

  const resolvedChannelType = normalizeNonEmptyString(channelType);
  if (!resolvedChannelType) throw buildServiceError("channelType is required", 400, "VALIDATION_ERROR");

  const resolvedOwnerId = ownerId ? String(ownerId) : null;
  const resolvedUserId = channelUserId != null ? normalizeNonEmptyString(channelUserId) : null;
  const resolvedContextId = channelContextId != null ? String(channelContextId) : "";
  const resolvedDisplayName = displayName != null ? String(displayName).trim().slice(0, 80) : null;

  if (resolvedType === "WEB_TO_CHANNEL" && !resolvedOwnerId) {
    throw buildServiceError("ownerId is required for WEB_TO_CHANNEL", 400, "VALIDATION_ERROR");
  }
  if (resolvedType === "CHANNEL_TO_WEB" && !resolvedUserId) {
    throw buildServiceError("channelUserId is required for CHANNEL_TO_WEB", 400, "VALIDATION_ERROR");
  }

  const secret = requirePairTokenSecret();
  const pairToken = generatePairToken();
  const tokenHash = hashToken(pairToken, secret);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000);

  const client = getSupabaseServiceClient();
  const payload: any = {
    token_hash: tokenHash,
    token_type: resolvedType,
    owner_id: resolvedOwnerId,
    channel_type: resolvedChannelType,
    channel_user_id: resolvedUserId,
    channel_context_id: resolvedContextId,
    display_name: resolvedDisplayName,
    expires_at: expiresAt.toISOString()
  };

  const { error } = await client.from("pairing_tokens").insert(payload);
  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return {
    pair_token: pairToken,
    expires_at: expiresAt.toISOString(),
    token_type: resolvedType
  };
}

export async function consumePairToken({
  pairToken,
  expectedType,
  ownerId,
  now = new Date()
}: any): Promise<PairingTokenRow> {
  const token = normalizeNonEmptyString(pairToken);
  if (!token) throw buildServiceError("pairToken is required", 400, "VALIDATION_ERROR");

  const resolvedType = normalizeNonEmptyString(expectedType);
  if (!resolvedType || !TOKEN_TYPES.has(resolvedType)) {
    throw buildServiceError("expectedType is invalid", 400, "VALIDATION_ERROR");
  }

  const secret = requirePairTokenSecret();
  const tokenHash = hashToken(token, secret);
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();

  const updatePayload: any = {
    consumed_at: nowIso
  };

  if (resolvedType === "CHANNEL_TO_WEB" && ownerId) {
    updatePayload.owner_id = String(ownerId);
  }

  const { data: consumed, error: consumeError } = await client
    .from("pairing_tokens")
    .update(updatePayload)
    .eq("token_hash", tokenHash)
    .eq("token_type", resolvedType)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (consumeError) {
    throw mapSupabaseServiceError(consumeError);
  }

  if (consumed) {
    return consumed;
  }

  // Determine the precise error class (invalid vs expired vs used).
  const { data: existing, error: lookupError } = await client
    .from("pairing_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (lookupError) {
    throw mapSupabaseServiceError(lookupError);
  }

  if (!existing) {
    throw buildServiceError("Invalid pairing token", 404, "PAIR_TOKEN_INVALID");
  }

  if (existing.token_type !== resolvedType) {
    throw buildServiceError("Invalid pairing token", 404, "PAIR_TOKEN_INVALID");
  }

  const expiresAt = existing.expires_at ? new Date(existing.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired) {
    throw buildServiceError("Pairing token expired", 400, "PAIR_TOKEN_EXPIRED");
  }

  if (existing.consumed_at) {
    throw buildServiceError("Pairing token already used", 409, "PAIR_TOKEN_USED");
  }

  throw buildServiceError("Invalid pairing token", 404, "PAIR_TOKEN_INVALID");
}
