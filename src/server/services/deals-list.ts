import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeDealsCursor } from "./deals-cursor";
import { normalizeReadMedia } from "../media/images";

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

async function enrichDealMediaRows({ client, rows }: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return list;

  const dealIds = Array.from(
    new Set(
      list
        .filter((row) => row && typeof row === "object")
        .map((row) => row.deal_id)
        .filter((id) => typeof id === "string" && id)
    )
  );

  if (dealIds.length === 0) {
    return list.map((row) => ({
      ...(row || {}),
      images_count: 0,
      cover_image: null
    }));
  }

  const { data, error } = await client
    .from("deals")
    .select("deal_id,images,cover_image_index")
    .in("deal_id", dealIds);

  if (error) mapError(error);

  const byDealId = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!row?.deal_id) continue;
    byDealId.set(row.deal_id, normalizeReadMedia({
      rawImages: row.images,
      rawCoverImageIndex: row.cover_image_index
    }));
  }

  return list.map((row) => {
    if (!row || typeof row !== "object") return row;
    const dealId = typeof row.deal_id === "string" ? row.deal_id : null;
    const media = dealId ? byDealId.get(dealId) : null;
    return {
      ...row,
      images_count: media?.images_count ?? 0,
      cover_image: media?.cover_image ?? null
    };
  });
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

  const rowsWithMedia = await enrichDealMediaRows({ client, rows: Array.isArray(data) ? data : [] });
  const rows = Array.isArray(rowsWithMedia) ? rowsWithMedia : [];
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

export async function listDealsByOwner({ ownerId, status, creatorAgentId, limit = 50, cursor }: any = {}) {
  const client = getSupabaseServiceClient();

  const { data: agentsData, error: agentsError } = await client
    .from("agents")
    .select("id")
    .eq("owner_id", ownerId);

  if (agentsError) mapError(agentsError);

  const agentIds = (agentsData || []).map((a: any) => a.id);
  if (agentIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const filterAgentIds = creatorAgentId
    ? agentIds.filter((id) => id === creatorAgentId)
    : agentIds;

  if (filterAgentIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const pageLimit = typeof limit === "number" ? limit : 50;
  const cappedLimit = Math.max(1, Math.min(MAX_LIMIT, pageLimit));
  const fetchLimit = cappedLimit + 1;

  let query = client
    .from("deals")
    .select("deal_id,title,status,temperature,price,currency,images,cover_image_index,created_at,creator_agent_id")
    .in("creator_agent_id", filterAgentIds)
    .order("created_at", { ascending: false })
    .order("deal_id", { ascending: false })
    .limit(fetchLimit);

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", ["NEW", "ACTIVE", "EXPIRED"]);
  }

  if (cursor?.created_at && cursor?.deal_id) {
    const createdAt = `"${cursor.created_at}"`;
    const dealId = `"${cursor.deal_id}"`;
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},deal_id.lt.${dealId})`
    );
  }

  const { data, error } = await query;
  if (error) mapError(error);

  const rows = data || [];
  const hasMore = rows.length > cappedLimit;
  const rawItems = hasMore ? rows.slice(0, cappedLimit) : rows;
  const items = rawItems.map((row: any) => {
    const media = normalizeReadMedia({
      rawImages: row?.images,
      rawCoverImageIndex: row?.cover_image_index
    });
    const { images, cover_image_index, ...rest } = row || {};
    return {
      ...rest,
      images_count: media.images_count,
      cover_image: media.cover_image
    };
  });

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1] as any;
    nextCursor = encodeDealsCursor({
      created_at: last.created_at,
      deal_id: last.deal_id
    });
  }

  return { items, nextCursor };
}

export { MAX_LIMIT as DEALS_MAX_LIMIT, DEFAULT_LIMIT as DEALS_DEFAULT_LIMIT };
