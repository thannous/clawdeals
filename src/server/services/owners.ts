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

export async function updateOwnerProfile({
  ownerId,
  displayName,
  bio,
  avatarUrl,
  city,
  stateRegion,
  country,
  showEmail,
  available,
}: {
  ownerId: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  showEmail?: boolean;
  available?: boolean;
}) {
  const client = getSupabaseServiceClient();
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };

  if (displayName !== undefined) payload.display_name = displayName;
  if (bio !== undefined) payload.bio = bio;
  if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;
  if (city !== undefined) payload.city = city;
  if (stateRegion !== undefined) payload.state_region = stateRegion;
  if (country !== undefined) payload.country = country;
  if (showEmail !== undefined) payload.show_email = showEmail;
  if (available !== undefined) payload.available = available;

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

export async function getOwnerPublicProfile(ownerId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owners")
    .select("display_name, avatar_url, email_verified_at, city, country, available, created_at, show_email, email")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  if (!data) return null;

  return {
    display_name: data.display_name || null,
    avatar_url: data.avatar_url || null,
    verified: Boolean(data.email_verified_at),
    city: data.city || null,
    country: data.country || null,
    available: data.available ?? true,
    created_at: data.created_at,
    email: data.show_email ? data.email : null,
  };
}

export async function getOwnerPublicProfiles(ownerIds: string[]) {
  if (ownerIds.length === 0) return new Map<string, any>();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owners")
    .select("owner_id, display_name, avatar_url, email_verified_at")
    .in("owner_id", ownerIds);

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  const map = new Map<string, { display_name: string | null; avatar_url: string | null; verified: boolean }>();
  if (data) {
    for (const row of data) {
      map.set(row.owner_id, {
        display_name: row.display_name || null,
        avatar_url: row.avatar_url || null,
        verified: Boolean(row.email_verified_at),
      });
    }
  }
  return map;
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
