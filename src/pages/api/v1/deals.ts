import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createDeal, findRecentDealDuplicate } from "../../../server/services/deals";
import { getDealById } from "../../../server/services/deal-detail";
import { DEALS_DEFAULT_LIMIT, DEALS_MAX_LIMIT, listDeals } from "../../../server/services/deals-list";
import { decodeDealsCursor } from "../../../server/services/deals-cursor";
import { matchDealToWatchlists } from "../../../server/services/watchlist-matching";
import { resolveTrustContext } from "../../../server/trustscore/context";
import {
  ALLOWED_CURRENCIES,
  DEAL_MAX_TTL_DAYS,
  DEAL_NEW_WINDOW_SECONDS,
  DUPLICATE_WINDOW_DAYS
} from "../../../server/config/deals";
import { fingerprintUrl, normalizeDealUrl, normalizeTags } from "../../../server/utils/deals";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "deals.listed";
    }

    if (ctx?.authError) {
      return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
    }

    if (!ctx?.agentId && !ctx?.ownerId) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
    }

    const sortRaw = resolveParam(req.query?.sort);
    const sortValue = sortRaw ? String(sortRaw).toLowerCase() : "new";
    if (sortValue !== "new" && sortValue !== "temp" && sortValue !== "trend") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort is invalid"));
    }

    const rawLimit = resolveParam(req.query?.limit);
    let limit = DEALS_DEFAULT_LIMIT;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
      const parsed = Number.parseInt(String(rawLimit), 10);
      if (Number.isNaN(parsed)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
      }
      if (parsed < 1 || parsed > DEALS_MAX_LIMIT) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${DEALS_MAX_LIMIT}`));
      }
      limit = parsed;
    }

    const rawQuery = resolveParam(req.query?.q);
    let q = null;
    if (rawQuery !== undefined && rawQuery !== null && rawQuery !== "") {
      if (typeof rawQuery !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "q must be a string"));
      }
      const trimmed = rawQuery.trim();
      if (trimmed) {
        if (trimmed.length > 80) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "q must be 1..80 characters"));
        }
        q = trimmed;
      }
    }

    const rawTags = resolveParam(req.query?.tags);
    let tags = [];
    if (rawTags !== undefined && rawTags !== null && rawTags !== "") {
      if (typeof rawTags !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tags must be a string"));
      }
      const parts = rawTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      try {
        tags = normalizeTags(parts);
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "tags are invalid"));
      }
    }

    const rawPriceMax = resolveParam(req.query?.price_max);
    let priceMax = null;
    if (rawPriceMax !== undefined && rawPriceMax !== null && rawPriceMax !== "") {
      const parsed = Number(rawPriceMax);
      if (!Number.isFinite(parsed)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_max must be a number"));
      }
      if (parsed < 0) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_max must be >= 0"));
      }
      priceMax = parsed;
    }

    const rawMinTemp = resolveParam(req.query?.min_temperature);
    let minTemperature = 0;
    if (rawMinTemp !== undefined && rawMinTemp !== null && rawMinTemp !== "") {
      const parsed = Number.parseInt(String(rawMinTemp), 10);
      if (Number.isNaN(parsed)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "min_temperature must be an integer"));
      }
      if (parsed < 0 || parsed > 100) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "min_temperature must be between 0 and 100"));
      }
      minTemperature = parsed;
    }

    const rawStatus = resolveParam(req.query?.status);
    const STATUS_VALUES = new Set(["NEW", "ACTIVE", "EXPIRED"]);
    let statuses = [];
    if (rawStatus !== undefined && rawStatus !== null && rawStatus !== "") {
      if (typeof rawStatus !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status must be a string"));
      }
      statuses = rawStatus
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (statuses.length === 0 || statuses.some((s) => !STATUS_VALUES.has(s))) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status is invalid"));
      }
      statuses = Array.from(new Set(statuses));
    }

    if (sortValue === "temp" || sortValue === "trend") {
      if (rawStatus !== undefined && rawStatus !== null && rawStatus !== "") {
        if (statuses.length !== 1 || statuses[0] !== "ACTIVE") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status must be ACTIVE for this sort"));
        }
      }
      statuses = ["ACTIVE"];
    } else if (statuses.length === 0) {
      statuses = ["NEW", "ACTIVE"];
    }

    const rawCursor = resolveParam(req.query?.cursor);
    let cursor = null;
    if (rawCursor) {
      const parsed = decodeDealsCursor(rawCursor);
      if (parsed?.error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      if (parsed?.value?.sort !== sortValue) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match sort"));
      }
      cursor = parsed?.value || null;
    }

    try {
      const result = await listDeals({
        sort: sortValue,
        statuses,
        q,
        tags,
        priceMax,
        minTemperature,
        limit,
        cursor,
        includeHidden: false
      });

      const items = (result.items || []).map((deal) => ({
        deal_id: deal.deal_id,
        title: deal.title,
        source_url: deal.source_url,
        price: toNumber(deal.price),
        currency: deal.currency,
        expires_at: deal.expires_at,
        tags: deal.tags || [],
        status: deal.status,
        temperature: deal.status === "NEW" ? null : deal.temperature,
        votes_up: deal.votes_up,
        votes_down: deal.votes_down,
        created_at: deal.created_at
      }));

      return jsonResponse(200, {
        items,
        next_cursor: result.nextCursor
      });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (ctx) {
    ctx.auditEvent = "deal.create";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const { title, url, price, currency, expires_at: expiresAtRaw, tags } = req.body || {};

  if (typeof title !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title is required"));
  }
  const normalizedTitle = title.trim();
  if (normalizedTitle.length < 3 || normalizedTitle.length > 140) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title must be 3..140 characters"));
  }

  if (typeof url !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "url is required"));
  }
  const sourceUrl = url.trim();
  if (!sourceUrl || sourceUrl.length > 2048) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "url must be 1..2048 characters"));
  }

  let normalizedUrl;
  try {
    normalizedUrl = normalizeDealUrl(sourceUrl);
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "url is invalid"));
  }

  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return jsonResponse(400, errorPayload("PRICE_INVALID", "price must be greater than 0"));
  }

  if (typeof currency !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency is required"));
  }
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.has(normalizedCurrency)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency is invalid"));
  }

  const expiresAt = parseDate(expiresAtRaw);
  if (!expiresAt) {
    return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at is invalid"));
  }
  const now = new Date();
  if (expiresAt <= now) {
    return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at must be in the future"));
  }
  const maxTtlMs = DEAL_MAX_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() > now.getTime() + maxTtlMs) {
    return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at exceeds max ttl"));
  }

  let normalizedTags = [];
  try {
    normalizedTags = normalizeTags(tags);
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "tags are invalid"));
  }

  try {
    const newUntil = new Date(now.getTime() + DEAL_NEW_WINDOW_SECONDS * 1000).toISOString();
    const fingerprint = fingerprintUrl(normalizedUrl);

    const duplicate = await findRecentDealDuplicate({
      fingerprint,
      now,
      windowDays: DUPLICATE_WINDOW_DAYS
    });
    if (duplicate) {
      // For OpenClaw (and other clients) we treat duplicate detection as an idempotent success:
      // return the existing deal instead of failing the workflow with a 409.
      let existingDeal = null;
      try {
        existingDeal = await getDealById({ dealId: duplicate.deal_id });
      } catch (error) {
        existingDeal = null;
      }

      if (ctx) {
        ctx.auditEvent = "deal.duplicate_returned";
        ctx.outcome = { type: "OK", reason: "duplicate" };
        ctx.security = {
          ...(ctx.security && typeof ctx.security === "object" ? ctx.security : {}),
          existing_deal_id: duplicate.deal_id,
          existing_created_at: duplicate.created_at
        };
      }

      if (!existingDeal) {
        return jsonResponse(200, {
          deal: { deal_id: duplicate.deal_id },
          meta: {
            duplicate: true,
            existing_deal_id: duplicate.deal_id,
            existing_created_at: duplicate.created_at
          }
        });
      }

      const responseDeal = {
        deal_id: existingDeal.deal_id,
        title: existingDeal.title,
        source_url: existingDeal.source_url,
        price: toNumber(existingDeal.price),
        currency: existingDeal.currency,
        expires_at: existingDeal.expires_at,
        status: existingDeal.status,
        temperature: existingDeal.status === "NEW" ? null : existingDeal.temperature,
        votes_up: existingDeal.votes_up,
        votes_down: existingDeal.votes_down,
        tags: existingDeal.tags || [],
        created_at: existingDeal.created_at
      };

      return jsonResponse(200, {
        deal: responseDeal,
        meta: {
          duplicate: true,
          existing_deal_id: duplicate.deal_id,
          existing_created_at: duplicate.created_at
        }
      });
    }

    await resolveTrustContext({ ctx, actionType: "deal.create" });

    const deal = await createDeal({
      title: normalizedTitle,
      sourceUrl,
      sourceUrlNormalized: normalizedUrl,
      sourceUrlFingerprint: fingerprint,
      price,
      currency: normalizedCurrency,
      expiresAt: expiresAt.toISOString(),
      tags: normalizedTags,
      status: "NEW",
      newUntil,
      temperature: null,
      votesUp: 0,
      votesDown: 0,
      votesWeightedUp: 0,
      votesWeightedDown: 0,
      reasonsCount: 0,
      creatorAgentId: ctx.agentId
    });

    const responseDeal = {
      deal_id: deal.deal_id,
      title: deal.title,
      source_url: deal.source_url,
      price: toNumber(deal.price),
      currency: deal.currency,
      expires_at: deal.expires_at,
      tags: deal.tags || [],
      status: deal.status,
      new_until: deal.new_until,
      temperature: deal.temperature,
      votes_up: deal.votes_up,
      votes_down: deal.votes_down,
      creator_agent_id: deal.creator_agent_id,
      created_at: deal.created_at
    };

    try {
      await matchDealToWatchlists({ deal });
    } catch (error) {
      console.info("watchlist.match_failed", {
        deal_id: deal?.deal_id || null,
        error: error?.message || String(error)
      });
    }

    return jsonResponse(201, { deal: responseDeal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
