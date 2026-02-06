import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeDealsCursor } from "./deals-cursor";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export async function listDeals({ sort = "new", statuses, q, tags, minTemperature = 0, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();

  const pageLimit = typeof limit === "number" ? limit : DEFAULT_LIMIT;
  const cappedLimit = Math.max(1, Math.min(MAX_LIMIT, pageLimit));
  const fetchLimit = cappedLimit + 1;

  let data;
  let error;
  let trendAsOf = null;

  if (sort === "new") {
    const statusesValue = Array.isArray(statuses) && statuses.length ? statuses : ["NEW", "ACTIVE"];
    ({ data, error } = await client.rpc("list_deals_new_v0", {
      p_statuses: statusesValue,
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_limit: fetchLimit,
      p_cursor_status: cursor?.status || null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    }));
  } else if (sort === "temp") {
    ({ data, error } = await client.rpc("list_deals_temp_v0", {
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_min_temperature: minTemperature ?? 0,
      p_limit: fetchLimit,
      p_cursor_temperature: cursor?.temperature ?? null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    }));
  } else if (sort === "trend") {
    trendAsOf = cursor?.as_of || new Date().toISOString();
    ({ data, error } = await client.rpc("list_deals_trend_v0", {
      p_as_of: trendAsOf,
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_min_temperature: minTemperature ?? 0,
      p_limit: fetchLimit,
      p_cursor_trend_score: cursor?.trend_score ?? null,
      p_cursor_active_at: cursor?.active_at || null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    }));
  } else {
    throw Object.assign(new Error("Invalid sort"), { status: 400, code: "VALIDATION_ERROR" });
  }

  if (error) {
    mapError(error);
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > cappedLimit;
  const items = hasMore ? rows.slice(0, cappedLimit) : rows;

  let nextCursor = null;
  if (hasMore && items.length) {
    const last = items[items.length - 1];
    if (sort === "new") {
      nextCursor = encodeDealsCursor({
        sort,
        status: last.status,
        created_at: last.created_at,
        deal_id: last.deal_id
      });
    } else if (sort === "temp") {
      nextCursor = encodeDealsCursor({
        sort,
        temperature: last.temperature,
        created_at: last.created_at,
        deal_id: last.deal_id
      });
    } else if (sort === "trend") {
      nextCursor = encodeDealsCursor({
        sort,
        as_of: trendAsOf || cursor?.as_of || new Date().toISOString(),
        trend_score: last.trend_score,
        active_at: last.active_at,
        created_at: last.created_at,
        deal_id: last.deal_id
      });
    }
  }

  return { items, nextCursor };
}

export { MAX_LIMIT as DEALS_MAX_LIMIT, DEFAULT_LIMIT as DEALS_DEFAULT_LIMIT };
