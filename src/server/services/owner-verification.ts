import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { evaluateChallenge } from "../utils/owner-verification";

export { evaluateChallenge };

export async function getLatestActiveChallenge(ownerId, type) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_verification_challenges")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("type", type)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function createChallenge({ ownerId, type, tokenHash, expiresAt, maxAttempts = 5 }) {
  const client = getSupabaseServiceClient();
  const payload = {
    owner_id: ownerId,
    type,
    token_hash: tokenHash,
    expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    attempt_count: 0,
    max_attempts: maxAttempts
  };

  const { data, error } = await client
    .from("owner_verification_challenges")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  return data;
}

export async function incrementChallengeAttempt(challengeId, nextAttemptCount) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_verification_challenges")
    .update({ attempt_count: nextAttemptCount })
    .eq("challenge_id", challengeId)
    .select("*")
    .single();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function consumeChallenge(challengeId, now = new Date()) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("owner_verification_challenges")
    .update({ consumed_at: now.toISOString() })
    .eq("challenge_id", challengeId)
    .select("*")
    .single();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
