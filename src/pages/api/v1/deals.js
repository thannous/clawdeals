import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createDeal } from "../../../server/services/deals";
import { resolveTrustContext } from "../../../server/trustscore/context";
import {
  ALLOWED_CURRENCIES,
  DEAL_MAX_TTL_DAYS,
  DEAL_NEW_WINDOW_SECONDS
} from "../../../server/config/deals";
import { fingerprintUrl, normalizeDealUrl, normalizeTags } from "../../../server/utils/deals";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
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
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
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
    await resolveTrustContext({ ctx, actionType: "deal.create" });

    const newUntil = new Date(now.getTime() + DEAL_NEW_WINDOW_SECONDS * 1000).toISOString();
    const fingerprint = fingerprintUrl(normalizedUrl);

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

    return jsonResponse(201, { deal: responseDeal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "deals.create"
});
