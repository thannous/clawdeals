import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const PAIRING_CODE_PREFIX = "CD-";
const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MINUTES = 10;
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CHANNEL_TYPES = new Set(["whatsapp", "telegram", "discord"]);
const CHANNEL_ROLES = new Set(["viewer", "approver", "owner"]);
const CHANNEL_STATES = new Set(["PENDING", "ACTIVE", "REVOKED"]);

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

function normalizeChannelType(value: any) {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (!CHANNEL_TYPES.has(normalized)) return null;
  return normalized;
}

function normalizeChannelContextId(value: any) {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return "";
  return raw.slice(0, 200);
}

function normalizeDisplayName(value: any) {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return null;
  return raw.slice(0, 80);
}

function normalizeRole(value: any, fallback = "viewer") {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (!CHANNEL_ROLES.has(normalized)) return fallback;
  return normalized;
}

function requirePairingSecret() {
  const secret = process.env.PAIRING_CODE_SECRET;
  if (!secret) {
    throw buildServiceError("PAIRING_CODE_SECRET is required", 500, "MISSING_SECRET");
  }
  return secret;
}

function generatePairingCode() {
  const bytes = crypto.randomBytes(PAIRING_CODE_LENGTH);
  let out = PAIRING_CODE_PREFIX;
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    out += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return out;
}

function hashPairingCode(code: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(String(code)).digest("hex");
}

export type ChannelIdentityRow = any;

async function getIdentityByNaturalKey({
  ownerId,
  channelType,
  channelUserId,
  channelContextId
}: any): Promise<ChannelIdentityRow | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("channel_type", channelType)
    .eq("channel_user_id", channelUserId)
    .eq("channel_context_id", channelContextId)
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function getChannelIdentity({ ownerId, channelIdentityId }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("channel_identity_id", channelIdentityId)
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function listChannelIdentities({ ownerId, state, channelType, limit = 50 }: any = {}) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const resolvedLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 50));
  const resolvedState = normalizeNonEmptyString(state);
  const resolvedChannelType = normalizeChannelType(channelType);

  if (resolvedState && !CHANNEL_STATES.has(resolvedState.toUpperCase())) {
    throw buildServiceError("state is invalid", 400, "VALIDATION_ERROR");
  }
  if (channelType && !resolvedChannelType) {
    throw buildServiceError("channel_type is invalid", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  let query = client
    .from("channel_identities")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("channel_identity_id", { ascending: false })
    .limit(resolvedLimit);

  if (resolvedState) {
    query = query.eq("state", resolvedState.toUpperCase());
  }
  if (resolvedChannelType) {
    query = query.eq("channel_type", resolvedChannelType);
  }

  const { data, error } = await query;
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || [];
}

export async function startPairing({
  ownerId,
  channelType,
  channelUserId,
  channelContextId,
  displayName,
  now = new Date()
}: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const type = normalizeChannelType(channelType);
  if (!type) throw buildServiceError("channelType is invalid", 400, "VALIDATION_ERROR");

  const userId = normalizeNonEmptyString(channelUserId);
  if (!userId) throw buildServiceError("channelUserId is required", 400, "VALIDATION_ERROR");

  const ctxId = normalizeChannelContextId(channelContextId);
  const name = normalizeDisplayName(displayName);

  const existing = await getIdentityByNaturalKey({
    ownerId,
    channelType: type,
    channelUserId: userId,
    channelContextId: ctxId
  });

  if (existing && existing.state === "ACTIVE") {
    return { identity: existing, code: null, expiresAt: null, alreadyActive: true };
  }

  const secret = requirePairingSecret();
  const code = generatePairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MINUTES * 60 * 1000);
  const codeHash = hashPairingCode(code, secret);

  const client = getSupabaseServiceClient();
  const payload: any = {
    owner_id: ownerId,
    channel_type: type,
    channel_user_id: userId,
    channel_context_id: ctxId,
    display_name: name ?? existing?.display_name ?? null,
    role: existing?.role ?? "viewer",
    state: "PENDING",
    pairing_code_hash: codeHash,
    pairing_expires_at: expiresAt.toISOString(),
    approved_by_human_id: null,
    approved_at: null,
    revoked_at: null
  };

  const { data, error } = await client
    .from("channel_identities")
    .upsert(payload, { onConflict: "channel_type,channel_user_id,channel_context_id,owner_id" })
    .select("*")
    .single();

  if (error) {
    throw mapSupabaseServiceError(error);
  }

  return { identity: data, code, expiresAt, alreadyActive: false };
}

export async function confirmPairingCode({ ownerId, code, now = new Date() }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const rawCode = normalizeNonEmptyString(code);
  if (!rawCode) throw buildServiceError("code is required", 400, "VALIDATION_ERROR");

  const secret = requirePairingSecret();
  const codeHash = hashPairingCode(rawCode, secret);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("pairing_code_hash", codeHash)
    .eq("state", "PENDING")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    return { ok: false, reason: "not_found", identity: null };
  }

  const expiresAt = data.pairing_expires_at ? new Date(data.pairing_expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  if (expired) {
    // Prevent stale code reuse; keep the identity PENDING so a new `pair` can refresh it.
    await client
      .from("channel_identities")
      .update({ pairing_code_hash: null, pairing_expires_at: null })
      .eq("channel_identity_id", data.channel_identity_id)
      .eq("owner_id", ownerId)
      .eq("state", "PENDING");
    return { ok: false, reason: "expired", identity: data };
  }

  return { ok: true, identity: data };
}

export async function approvePairing({
  ownerId,
  channelIdentityId,
  role = "approver",
  approvedBy,
  now = new Date()
}: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const resolvedRole = normalizeRole(role, "approver");
  const resolvedApprovedBy = approvedBy || null;

  const existing = await getChannelIdentity({ ownerId, channelIdentityId });
  if (!existing) throw buildServiceError("Channel identity not found", 404, "NOT_FOUND");
  if (existing.state !== "PENDING") {
    throw buildServiceError("Pairing is not pending", 409, "PAIRING_NOT_PENDING");
  }

  const expiresAt = existing.pairing_expires_at ? new Date(existing.pairing_expires_at) : null;
  const expired =
    !existing.pairing_code_hash ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime();

  if (expired) {
    throw buildServiceError("Pairing code expired", 409, "PAIRING_EXPIRED");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .update({
      state: "ACTIVE",
      role: resolvedRole,
      approved_at: now.toISOString(),
      approved_by_human_id: resolvedApprovedBy,
      pairing_code_hash: null,
      pairing_expires_at: null,
      revoked_at: null
    })
    .eq("channel_identity_id", channelIdentityId)
    .eq("owner_id", ownerId)
    .eq("state", "PENDING")
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Pairing approval conflict", 409, "CONFLICT");
  }

  return data;
}

export async function denyPairing({ ownerId, channelIdentityId, deniedBy, now = new Date() }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const existing = await getChannelIdentity({ ownerId, channelIdentityId });
  if (!existing) throw buildServiceError("Channel identity not found", 404, "NOT_FOUND");
  if (existing.state !== "PENDING") {
    throw buildServiceError("Pairing is not pending", 409, "PAIRING_NOT_PENDING");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .update({
      state: "REVOKED",
      revoked_at: now.toISOString(),
      approved_by_human_id: deniedBy || null,
      pairing_code_hash: null,
      pairing_expires_at: null
    })
    .eq("channel_identity_id", channelIdentityId)
    .eq("owner_id", ownerId)
    .eq("state", "PENDING")
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Pairing deny conflict", 409, "CONFLICT");
  }

  return data;
}

export async function revokePairing({ ownerId, channelIdentityId, revokedBy, now = new Date() }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const existing = await getChannelIdentity({ ownerId, channelIdentityId });
  if (!existing) throw buildServiceError("Channel identity not found", 404, "NOT_FOUND");
  if (existing.state !== "ACTIVE") {
    throw buildServiceError("Pairing is not active", 409, "PAIRING_NOT_ACTIVE");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .update({
      state: "REVOKED",
      revoked_at: now.toISOString(),
      approved_by_human_id: revokedBy || null,
      pairing_code_hash: null,
      pairing_expires_at: null
    })
    .eq("channel_identity_id", channelIdentityId)
    .eq("owner_id", ownerId)
    .eq("state", "ACTIVE")
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  if (!data) {
    throw buildServiceError("Pairing revoke conflict", 409, "CONFLICT");
  }

  return data;
}

export async function findActiveIdentity({ ownerId, channelType, channelUserId, channelContextId }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const type = normalizeChannelType(channelType);
  if (!type) throw buildServiceError("channelType is invalid", 400, "VALIDATION_ERROR");

  const userId = normalizeNonEmptyString(channelUserId);
  if (!userId) throw buildServiceError("channelUserId is required", 400, "VALIDATION_ERROR");

  const ctxId = normalizeChannelContextId(channelContextId);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("channel_type", type)
    .eq("channel_user_id", userId)
    .eq("channel_context_id", ctxId)
    .eq("state", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function findActiveIdentityByChannel({ channelType, channelUserId, channelContextId }: any) {
  const type = normalizeChannelType(channelType);
  if (!type) throw buildServiceError("channelType is invalid", 400, "VALIDATION_ERROR");

  const userId = normalizeNonEmptyString(channelUserId);
  if (!userId) throw buildServiceError("channelUserId is required", 400, "VALIDATION_ERROR");

  const ctxId = normalizeChannelContextId(channelContextId);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("channel_type", type)
    .eq("channel_user_id", userId)
    .eq("channel_context_id", ctxId)
    .eq("state", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function findPendingIdentityByChannel({ channelType, channelUserId, channelContextId }: any) {
  const type = normalizeChannelType(channelType);
  if (!type) throw buildServiceError("channelType is invalid", 400, "VALIDATION_ERROR");

  const userId = normalizeNonEmptyString(channelUserId);
  if (!userId) throw buildServiceError("channelUserId is required", 400, "VALIDATION_ERROR");

  const ctxId = normalizeChannelContextId(channelContextId);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .select("*")
    .eq("channel_type", type)
    .eq("channel_user_id", userId)
    .eq("channel_context_id", ctxId)
    .eq("state", "PENDING")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function upsertIdentityForPairing({
  ownerId,
  channelType,
  channelUserId,
  channelContextId,
  displayName,
  role = "owner",
  state,
  approvedBy,
  now = new Date()
}: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const type = normalizeChannelType(channelType);
  if (!type) throw buildServiceError("channelType is invalid", 400, "VALIDATION_ERROR");

  const userId = normalizeNonEmptyString(channelUserId);
  if (!userId) throw buildServiceError("channelUserId is required", 400, "VALIDATION_ERROR");

  const ctxId = normalizeChannelContextId(channelContextId);
  const name = normalizeDisplayName(displayName);
  const resolvedRole = normalizeRole(role, "owner");

  const resolvedState = normalizeNonEmptyString(state);
  if (!resolvedState || (resolvedState !== "ACTIVE" && resolvedState !== "PENDING")) {
    throw buildServiceError("state is invalid", 400, "VALIDATION_ERROR");
  }

  const payload: any = {
    owner_id: ownerId,
    channel_type: type,
    channel_user_id: userId,
    channel_context_id: ctxId,
    display_name: name ?? null,
    role: resolvedRole,
    state: resolvedState,
    pairing_code_hash: null,
    pairing_expires_at: null,
    revoked_at: null
  };

  if (resolvedState === "ACTIVE") {
    payload.approved_at = now.toISOString();
    payload.approved_by_human_id = approvedBy || ownerId;
  } else {
    payload.approved_at = null;
    payload.approved_by_human_id = null;
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("channel_identities")
    .upsert(payload, { onConflict: "channel_type,channel_user_id,channel_context_id,owner_id" })
    .select("*")
    .single();

  if (error) {
    // When the channel is already linked to another owner (non-REVOKED), the partial unique index will fail.
    if (typeof error.message === "string" && /channel_identities_unique_channel_non_revoked_idx/i.test(error.message)) {
      throw buildServiceError("Channel identity is already paired to another owner", 409, "CHANNEL_ALREADY_PAIRED");
    }
    throw mapSupabaseServiceError(error);
  }

  return data;
}

export async function touchLastSeen({ ownerId, channelIdentityId, now = new Date() }: any) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const client = getSupabaseServiceClient();
  const { error } = await client
    .from("channel_identities")
    .update({ last_seen_at: now.toISOString() })
    .eq("owner_id", ownerId)
    .eq("channel_identity_id", channelIdentityId);

  if (error) {
    throw mapSupabaseServiceError(error);
  }
}
