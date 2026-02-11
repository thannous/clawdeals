import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { isUuid } from "../utils/validators";

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function mapSupabaseServiceError(error: any) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

export async function getOwnerLinkBySupabaseUserId(supabaseUserId: string) {
  const resolved = normalizeNonEmptyString(supabaseUserId);
  if (!resolved || !isUuid(resolved)) {
    throw buildServiceError("supabaseUserId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_auth_links")
    .select("*")
    .eq("supabase_user_id", resolved)
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

export async function createOwnerLink({
  ownerId,
  supabaseUserId,
  email,
  emailVerifiedAt,
  now = new Date()
}: {
  ownerId: string;
  supabaseUserId: string;
  email?: string | null;
  emailVerifiedAt?: string | null;
  now?: Date;
}) {
  const resolvedOwnerId = normalizeNonEmptyString(ownerId);
  if (!resolvedOwnerId || !isUuid(resolvedOwnerId)) {
    throw buildServiceError("ownerId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const resolvedSupabaseUserId = normalizeNonEmptyString(supabaseUserId);
  if (!resolvedSupabaseUserId || !isUuid(resolvedSupabaseUserId)) {
    throw buildServiceError("supabaseUserId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const payload = {
    owner_id: resolvedOwnerId,
    supabase_user_id: resolvedSupabaseUserId,
    email: normalizeNonEmptyString(email),
    email_verified_at: normalizeNonEmptyString(emailVerifiedAt),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    last_login_at: now.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("owner_auth_links").insert(payload).select("*").single();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data;
}

export async function touchOwnerLinkLogin({
  supabaseUserId,
  email,
  emailVerifiedAt,
  now = new Date()
}: {
  supabaseUserId: string;
  email?: string | null;
  emailVerifiedAt?: string | null;
  now?: Date;
}) {
  const resolvedSupabaseUserId = normalizeNonEmptyString(supabaseUserId);
  if (!resolvedSupabaseUserId || !isUuid(resolvedSupabaseUserId)) {
    throw buildServiceError("supabaseUserId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const payload = {
    email: normalizeNonEmptyString(email),
    email_verified_at: normalizeNonEmptyString(emailVerifiedAt),
    updated_at: now.toISOString(),
    last_login_at: now.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_auth_links")
    .update(payload)
    .eq("supabase_user_id", resolvedSupabaseUserId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}
