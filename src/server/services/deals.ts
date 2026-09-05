import { assertPublishableDealSource } from "../utils/synthetic-deal";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapVoteError(error) {
  if (!error) return null;
  const message = error.message || "";
  if (/ALREADY_VOTED/i.test(message)) {
    return { status: 409, code: "ALREADY_VOTED", message: "Already voted on this deal" };
  }
  if (/DEAL_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "DEAL_NOT_FOUND", message: "Deal not found" };
  }
  if (/DEAL_EXPIRED/i.test(message)) {
    return { status: 409, code: "DEAL_EXPIRED", message: "Deal is expired" };
  }
  if (error.code === "23505" || /duplicate key value/i.test(message)) {
    return { status: 409, code: "ALREADY_VOTED", message: "Already voted on this deal" };
  }
  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function isMissingDealMediaColumns(error: any) {
  const message = error?.message || "";
  if (typeof message !== "string") return false;
  const referencesMediaColumns = message.includes("images") || message.includes("cover_image_index");
  const missingColumnHint = message.includes("does not exist") || message.toLowerCase().includes("schema cache");
  return referencesMediaColumns && missingColumnHint;
}

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
  creatorAgentId,
  images,
  coverImageIndex,
  dealType,
  country,
  marketCode = undefined,
  merchantName,
  merchantDomain
}) {
  assertPublishableDealSource(sourceUrl);
  const client = getSupabaseServiceClient();
  const hasRequestedMedia =
    (Array.isArray(images) && images.length > 0) ||
    (coverImageIndex !== null && coverImageIndex !== undefined);
  const payload: any = {
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
    creator_agent_id: creatorAgentId,
    images: images ?? null,
    cover_image_index: coverImageIndex ?? null
  };
  if (dealType !== undefined) payload.deal_type = dealType;
  if (country !== undefined) payload.country = country;
  if (marketCode !== undefined) payload.market_code = marketCode;
  if (merchantName !== undefined) payload.merchant_name = merchantName;
  if (merchantDomain !== undefined) payload.merchant_domain = merchantDomain;

  let { data, error } = await client.from("deals").insert(payload).select().single();

  // Backward compatibility: tolerate DBs where media columns are not yet migrated.
  if (error && isMissingDealMediaColumns(error)) {
    if (hasRequestedMedia) {
      throw Object.assign(new Error("Deal media fields are unavailable until database migration is applied"), {
        status: 503,
        code: "FEATURE_UNAVAILABLE"
      });
    }

    const fallbackPayload: any = { ...payload };
    delete fallbackPayload.images;
    delete fallbackPayload.cover_image_index;
    ({ data, error } = await client.from("deals").insert(fallbackPayload).select().single());
    if (!error && data) {
      data = { ...data, images: null, cover_image_index: null };
    }
  }

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function findRecentDealDuplicate({
  fingerprint,
  marketCode,
  now = new Date(),
  windowDays = 14
}: any = {}) {
  if (!fingerprint || typeof fingerprint !== "string") {
    return null;
  }

  const days = Number.isFinite(windowDays) ? windowDays : 14;
  const windowMs = Math.max(0, days) * 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs).toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .select("deal_id, created_at, status")
    .eq("source_url_fingerprint", fingerprint)
    .eq("market_code", marketCode)
    .gte("created_at", windowStart)
    .neq("status", "REMOVED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  if (!data) return null;

  return {
    deal_id: data.deal_id,
    created_at: data.created_at
  };
}

export async function createDealVote({ dealId, agentId, direction, reason, weight }) {
  const client = getSupabaseServiceClient();
  const payload = {
    p_deal_id: dealId,
    p_agent_id: agentId,
    p_direction: direction,
    p_reason: reason,
    p_weight: weight
  };

  const { data, error } = await client.rpc("deal_vote_v0", payload).single();
  if (error) {
    const mapped = mapVoteError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
