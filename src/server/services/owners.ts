import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { normalizeEmail } from "../utils/owner-verification";

function escapeLikePattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getOwner(ownerId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("owners").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function getOwnerByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owners")
    .select("*")
    .ilike("email", escapeLikePattern(normalized))
    .limit(1)
    .maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function upsertOwner({
  ownerId,
  email,
  phoneE164,
  emailVerifiedAt,
  phoneVerifiedAt,
  updatedAt = new Date()
}) {
  const client = getSupabaseServiceClient();
  const payload = {
    owner_id: ownerId,
    email: email ?? null,
    phone_e164: phoneE164 ?? null,
    email_verified_at: emailVerifiedAt ?? null,
    phone_verified_at: phoneVerifiedAt ?? null,
    updated_at: updatedAt.toISOString()
  };

  const { data, error } = await client
    .from("owners")
    .upsert(payload, { onConflict: "owner_id" })
    .select("*")
    .single();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function ensureOwnerExists(ownerId) {
  const client = getSupabaseServiceClient();
  const payload = {
    owner_id: ownerId,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await client
    .from("owners")
    .upsert(payload, { onConflict: "owner_id" })
    .select("*")
    .single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function invalidateOwnerChallenges({ ownerId, type, now = new Date() }) {
  const client = getSupabaseServiceClient();
  const { error } = await client
    .from("owner_verification_challenges")
    .update({ consumed_at: now.toISOString() })
    .eq("owner_id", ownerId)
    .eq("type", type)
    .is("consumed_at", null);

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
}

export async function setOwnerVerified({ ownerId, type, verifiedAt = new Date() }) {
  const client = getSupabaseServiceClient();
  const payload: any = {
    updated_at: verifiedAt.toISOString()
  };
  if (type === "EMAIL") {
    payload.email_verified_at = verifiedAt.toISOString();
  } else if (type === "PHONE") {
    payload.phone_verified_at = verifiedAt.toISOString();
  }

  const { data, error } = await client
    .from("owners")
    .update(payload)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
