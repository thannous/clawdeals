import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeDealsCursor } from "./deals-cursor";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isRpcParamMismatch(error: any, paramName: string) {
  const message = error?.message || "";
  return typeof message === "string" && message.includes(paramName) && message.includes("schema cache");
}

export async function listDeals({
  sort = "new",
  statuses,
  q,
  tags,
  priceMax,
  minTemperature = 0,
  limit,
  cursor,
  includeHidden = false
}: any = {}) {
  const client = getSupabaseServiceClient();

  const pageLimit = typeof limit === "number" ? limit : DEFAULT_LIMIT;
  const cappedLimit = Math.max(1, Math.min(MAX_LIMIT, pageLimit));
  const fetchLimit = cappedLimit + 1;

  let data;
  let error;
  let trendAsOf = null;
  const includeHiddenValue = Boolean(includeHidden);

  // We always include p_price_max (even null) to disambiguate PostgREST RPC overloads when
  // both list_deals_* variants exist with and without p_price_max.
  const normalizedPriceMax = Number.isFinite(priceMax) ? priceMax : null;

  if (sort === "new") {
    const statusesValue = Array.isArray(statuses) && statuses.length ? statuses : ["NEW", "ACTIVE"];
    const payload: any = {
      p_statuses: statusesValue,
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_price_max: normalizedPriceMax,
      p_include_hidden: includeHiddenValue,
      p_limit: fetchLimit,
      p_cursor_status: cursor?.status || null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    };
    ({ data, error } = await client.rpc("list_deals_new_v0", payload));
    if (error && payload.p_price_max !== undefined && isRpcParamMismatch(error, "p_price_max")) {
      delete payload.p_price_max;
      ({ data, error } = await client.rpc("list_deals_new_v0", payload));
    }
    if (error && payload.p_include_hidden !== undefined && isRpcParamMismatch(error, "p_include_hidden")) {
      delete payload.p_include_hidden;
      ({ data, error } = await client.rpc("list_deals_new_v0", payload));
    }
  } else if (sort === "temp") {
    const payload: any = {
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_price_max: normalizedPriceMax,
      p_include_hidden: includeHiddenValue,
      p_min_temperature: minTemperature ?? 0,
      p_limit: fetchLimit,
      p_cursor_temperature: cursor?.temperature ?? null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    };
    ({ data, error } = await client.rpc("list_deals_temp_v0", payload));
    if (error && payload.p_price_max !== undefined && isRpcParamMismatch(error, "p_price_max")) {
      delete payload.p_price_max;
      ({ data, error } = await client.rpc("list_deals_temp_v0", payload));
    }
    if (error && payload.p_include_hidden !== undefined && isRpcParamMismatch(error, "p_include_hidden")) {
      delete payload.p_include_hidden;
      ({ data, error } = await client.rpc("list_deals_temp_v0", payload));
    }
  } else if (sort === "trend") {
    trendAsOf = cursor?.as_of || new Date().toISOString();
    const payload: any = {
      p_as_of: trendAsOf,
      p_q: q || null,
      p_tags: tags && tags.length ? tags : null,
      p_price_max: normalizedPriceMax,
      p_include_hidden: includeHiddenValue,
      p_min_temperature: minTemperature ?? 0,
      p_limit: fetchLimit,
      p_cursor_trend_score: cursor?.trend_score ?? null,
      // Backwards compatibility: older cursor included active_at, but ranking v1 uses created_at/id tie-breakers.
      p_cursor_active_at: cursor?.active_at || null,
      p_cursor_created_at: cursor?.created_at || null,
      p_cursor_deal_id: cursor?.deal_id || null
    };
    ({ data, error } = await client.rpc("list_deals_trend_v0", payload));
    if (error && payload.p_price_max !== undefined && isRpcParamMismatch(error, "p_price_max")) {
      delete payload.p_price_max;
      ({ data, error } = await client.rpc("list_deals_trend_v0", payload));
    }
    if (error && payload.p_include_hidden !== undefined && isRpcParamMismatch(error, "p_include_hidden")) {
      delete payload.p_include_hidden;
      ({ data, error } = await client.rpc("list_deals_trend_v0", payload));
    }
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
        // Backwards compatibility: some RPC variants still keyset paginate on active_at.
        active_at: last.active_at || null,
        created_at: last.created_at,
        deal_id: last.deal_id
      });
    }
  }

  return { items, nextCursor };
}

export { MAX_LIMIT as DEALS_MAX_LIMIT, DEFAULT_LIMIT as DEALS_DEFAULT_LIMIT };
