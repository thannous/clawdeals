import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { isUuid } from "../utils/validators";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export function encodeDealCommentsCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    deal_id: cursor.deal_id,
    created_at: cursor.created_at,
    deal_comment_id: cursor.deal_comment_id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeDealCommentsCursor(raw) {
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

  if (!isUuid(parsed.deal_id) || !isUuid(parsed.deal_comment_id) || typeof parsed.created_at !== "string") {
    return { error: "Invalid cursor" };
  }

  return {
    value: {
      deal_id: parsed.deal_id,
      created_at: parsed.created_at,
      deal_comment_id: parsed.deal_comment_id
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

export async function listDealComments({ dealId, limit, cursor } = {}) {
  if (!isUuid(dealId)) {
    throw buildServiceError("dealId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const pageLimitRaw = typeof limit === "number" ? limit : DEFAULT_LIMIT;
  const pageLimit = Math.max(1, Math.min(MAX_LIMIT, pageLimitRaw));

  await ensureDealExists(dealId);

  const client = getSupabaseServiceClient();
  let query = client
    .from("deal_comments")
    .select("deal_comment_id, deal_id, owner_id, comment_type, body, created_at, updated_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .order("deal_comment_id", { ascending: false })
    .limit(pageLimit + 1);

  if (cursor?.created_at && cursor?.deal_comment_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const commentId = formatFilterValue(cursor.deal_comment_id);
    query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},deal_comment_id.lt.${commentId})`);
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const comments = Array.isArray(data) ? data : [];
  const hasMore = comments.length > pageLimit;
  const items = hasMore ? comments.slice(0, pageLimit) : comments;
  const nextCursor = hasMore && items.length
    ? encodeDealCommentsCursor({
        deal_id: dealId,
        created_at: items[items.length - 1].created_at,
        deal_comment_id: items[items.length - 1].deal_comment_id
      })
    : null;

  return { items, nextCursor };
}

export async function createDealComment({ dealId, ownerId, commentType, body } = {}) {
  if (!isUuid(dealId)) {
    throw buildServiceError("dealId must be a UUID", 400, "VALIDATION_ERROR");
  }
  if (!isUuid(ownerId)) {
    throw buildServiceError("ownerId must be a UUID", 400, "VALIDATION_ERROR");
  }

  await ensureDealExists(dealId);

  const typeValue = commentType || "note";
  if (typeValue !== "note") {
    throw buildServiceError("comment_type is invalid", 400, "VALIDATION_ERROR");
  }

  const nowIso = new Date().toISOString();
  const client = getSupabaseServiceClient();
  const payload = {
    deal_id: dealId,
    owner_id: ownerId,
    comment_type: typeValue,
    body,
    updated_at: nowIso
  };

  const { data, error } = await client.from("deal_comments").insert(payload).select("*").single();
  if (error) {
    mapError(error);
  }
  return data;
}

export const DEAL_COMMENTS_DEFAULT_LIMIT = DEFAULT_LIMIT;
export const DEAL_COMMENTS_MAX_LIMIT = MAX_LIMIT;

