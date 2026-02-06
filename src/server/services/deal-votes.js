import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { isUuid } from "../utils/validators";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function encodeDealVotesCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    deal_id: cursor.deal_id,
    direction: cursor.direction ?? null,
    created_at: cursor.created_at,
    deal_vote_id: cursor.deal_vote_id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeDealVotesCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }

  if (!isUuid(parsed.deal_id) || !isUuid(parsed.deal_vote_id) || typeof parsed.created_at !== "string") {
    return { error: "Invalid cursor" };
  }

  const direction = parsed.direction ?? null;
  if (direction !== null && direction !== "up" && direction !== "down") {
    return { error: "Invalid cursor" };
  }

  return {
    value: {
      deal_id: parsed.deal_id,
      direction,
      created_at: parsed.created_at,
      deal_vote_id: parsed.deal_vote_id
    }
  };
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function buildServiceError(message, status = 500, code = "ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

async function ensureDealExists(dealId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("deals").select("deal_id").eq("deal_id", dealId).maybeSingle();
  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
  }
}

export async function listDealVotes({ dealId, direction, limit, cursor } = {}) {
  if (!isUuid(dealId)) {
    throw buildServiceError("dealId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const directionValue = direction === "up" ? 1 : direction === "down" ? -1 : null;
  if (direction !== undefined && direction !== null && directionValue === null) {
    throw buildServiceError("direction is invalid", 400, "VALIDATION_ERROR");
  }

  const pageLimitRaw = typeof limit === "number" ? limit : DEFAULT_LIMIT;
  const pageLimit = Math.max(1, Math.min(MAX_LIMIT, pageLimitRaw));

  await ensureDealExists(dealId);

  const client = getSupabaseServiceClient();
  let query = client
    .from("deal_votes")
    .select("deal_vote_id, deal_id, agent_id, direction, reason, weight, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .order("deal_vote_id", { ascending: false })
    .limit(pageLimit + 1);

  if (directionValue !== null) {
    query = query.eq("direction", directionValue);
  }

  if (cursor?.created_at && cursor?.deal_vote_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const voteId = formatFilterValue(cursor.deal_vote_id);
    query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},deal_vote_id.lt.${voteId})`);
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const votes = Array.isArray(data) ? data : [];
  const hasMore = votes.length > pageLimit;
  const items = hasMore ? votes.slice(0, pageLimit) : votes;
  const nextCursor = hasMore && items.length
    ? encodeDealVotesCursor({
        deal_id: dealId,
        direction: direction ?? null,
        created_at: items[items.length - 1].created_at,
        deal_vote_id: items[items.length - 1].deal_vote_id
      })
    : null;

  return { items, nextCursor };
}

export const DEAL_VOTES_DEFAULT_LIMIT = DEFAULT_LIMIT;
export const DEAL_VOTES_MAX_LIMIT = MAX_LIMIT;
