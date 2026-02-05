import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createDeal({
  title,
  sourceUrl,
  sourceUrlNormalized,
  sourceUrlFingerprint,
  price,
  currency,
  expiresAt,
  tags,
  status = "NEW",
  newUntil,
  temperature = null,
  votesUp = 0,
  votesDown = 0,
  votesWeightedUp = 0,
  votesWeightedDown = 0,
  reasonsCount = 0,
  creatorAgentId
}) {
  const client = getSupabaseServiceClient();
  const payload = {
    title,
    source_url: sourceUrl,
    source_url_normalized: sourceUrlNormalized,
    source_url_fingerprint: sourceUrlFingerprint,
    price,
    currency,
    expires_at: expiresAt,
    tags: tags || [],
    status,
    new_until: newUntil,
    temperature,
    votes_up: votesUp,
    votes_down: votesDown,
    votes_weighted_up: votesWeightedUp,
    votes_weighted_down: votesWeightedDown,
    reasons_count: reasonsCount,
    creator_agent_id: creatorAgentId
  };
  const { data, error } = await client.from("deals").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
