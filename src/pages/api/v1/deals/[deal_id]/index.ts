import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getDealById } from "../../../../../server/services/deal-detail";
import { applyDealUpdate, getDealForUpdate } from "../../../../../server/services/deal-update";
import { getDealForRemove, removeDeal } from "../../../../../server/services/deal-remove";
import { isUuid } from "../../../../../server/utils/validators";
import { ALLOWED_CURRENCIES, DEAL_MAX_TTL_DAYS, DEAL_TYPES, COUNTRY_RE } from "../../../../../server/config/deals";
import { normalizeTags } from "../../../../../server/utils/deals";
import {
  normalizeReadMedia,
  parseCoverImageIndex,
  parseImagesStrict,
  resolveCoverImageIndexForWrite
} from "../../../../../server/media/images";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeaderValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
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

function mapDealResponse(deal: any, { includeImages = false }: { includeImages?: boolean } = {}) {
  const media = normalizeReadMedia({
    rawImages: deal?.images,
    rawCoverImageIndex: deal?.cover_image_index
  });

  const response: any = {
    deal_id: deal.deal_id,
    title: deal.title,
    source_url: deal.source_url,
    price: toNumber(deal.price),
    currency: deal.currency,
    expires_at: deal.expires_at,
    status: deal.status,
    temperature: deal.status === "NEW" ? null : deal.temperature,
    votes_up: deal.votes_up,
    votes_down: deal.votes_down,
    tags: deal.tags || [],
    deal_type: deal.deal_type || "ONLINE",
    country: deal.country || null,
    merchant_name: deal.merchant_name || null,
    merchant_domain: deal.merchant_domain || null,
    images_count: media.images_count,
    cover_image: media.cover_image,
    created_at: deal.created_at
  };

  if (includeImages) {
    response.images = media.images;
    response.cover_image_index = media.cover_image_index;
  }

  return response;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE") {
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }

  if (ctx) {
    ctx.auditEvent =
      req.method === "PATCH" ? "deal.update_rejected" :
      req.method === "DELETE" ? "deal.remove_rejected" :
      "deal.viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (req.method === "PATCH" || req.method === "DELETE") {
    const idempotencyKey = getHeaderValue(req.headers, "idempotency-key");
    if (!idempotencyKey) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }
  }

  if (req.method === "GET") {
    if (!ctx?.agentId && !ctx?.ownerId) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
    }
  } else {
    if (!ctx?.agentId) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
    }
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  try {
    if (req.method === "PATCH") {
      const existing = await getDealForUpdate({ dealId });

      const body = req.body || {};
      const patch: any = {};
      const hasImages = Object.prototype.hasOwnProperty.call(body, "images");
      const hasCoverImageIndex = Object.prototype.hasOwnProperty.call(body, "cover_image_index");
      let parsedImages = undefined;
      let parsedCoverImageIndex = null;

      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        if (typeof body.title !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title must be a string"));
        }
        const normalizedTitle = body.title.trim();
        if (normalizedTitle.length < 3 || normalizedTitle.length > 140) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title must be 3..140 characters"));
        }
        patch.title = normalizedTitle;
      }

      if (Object.prototype.hasOwnProperty.call(body, "price")) {
        const price = body.price;
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
          return jsonResponse(400, errorPayload("PRICE_INVALID", "price must be greater than 0"));
        }
        patch.price = price;
      }

      if (Object.prototype.hasOwnProperty.call(body, "currency")) {
        if (typeof body.currency !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency must be a string"));
        }
        const normalizedCurrency = body.currency.trim().toUpperCase();
        if (!ALLOWED_CURRENCIES.has(normalizedCurrency)) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency is invalid"));
        }
        patch.currency = normalizedCurrency;
      }

      if (Object.prototype.hasOwnProperty.call(body, "expires_at")) {
        const expiresAt = parseDate(body.expires_at);
        if (!expiresAt) {
          return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at is invalid"));
        }
        const now = new Date();
        if (expiresAt <= now) {
          return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at must be in the future"));
        }

        const createdAt = parseDate(existing.created_at);
        if (createdAt) {
          const maxTtlMs = DEAL_MAX_TTL_DAYS * 24 * 60 * 60 * 1000;
          if (expiresAt.getTime() > createdAt.getTime() + maxTtlMs) {
            return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at exceeds max ttl"));
          }
          if (expiresAt <= createdAt) {
            return jsonResponse(400, errorPayload("EXPIRES_AT_INVALID", "expires_at must be after created_at"));
          }
        }

        patch.expires_at = expiresAt.toISOString();
      }

      if (Object.prototype.hasOwnProperty.call(body, "tags")) {
        let normalizedTags = [];
        try {
          normalizedTags = normalizeTags(body.tags);
        } catch (error) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "tags are invalid"));
        }
        patch.tags = normalizedTags;
      }

      if (Object.prototype.hasOwnProperty.call(body, "deal_type")) {
        if (typeof body.deal_type !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_type must be a string"));
        }
        const dt = body.deal_type.trim().toUpperCase();
        if (!DEAL_TYPES.has(dt)) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_type must be ONLINE or LOCAL"));
        }
        patch.deal_type = dt;
      }

      if (Object.prototype.hasOwnProperty.call(body, "country")) {
        if (body.country === null) {
          patch.country = null;
        } else {
          if (typeof body.country !== "string") {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "country must be a string"));
          }
          const c = body.country.trim().toUpperCase();
          if (!COUNTRY_RE.test(c)) {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "country must be a 2-letter ISO code"));
          }
          patch.country = c;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "merchant_name")) {
        if (body.merchant_name === null) {
          patch.merchant_name = null;
        } else {
          if (typeof body.merchant_name !== "string") {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "merchant_name must be a string"));
          }
          const mn = body.merchant_name.trim();
          if (mn.length < 1 || mn.length > 120) {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "merchant_name must be 1..120 characters"));
          }
          patch.merchant_name = mn;
        }
      }

      if (hasImages) {
        try {
          parsedImages = parseImagesStrict(body.images, "images");
        } catch (error) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "images are invalid"));
        }
      }

      if (hasCoverImageIndex) {
        try {
          parsedCoverImageIndex = parseCoverImageIndex(body.cover_image_index);
        } catch (error) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "cover_image_index is invalid"));
        }
      }

      if (hasImages || hasCoverImageIndex) {
        const existingMedia = normalizeReadMedia({
          rawImages: existing?.images,
          rawCoverImageIndex: existing?.cover_image_index
        });
        const candidateImages = hasImages ? parsedImages : existingMedia.images;
        const candidateCoverImageIndex =
          hasCoverImageIndex
            ? parsedCoverImageIndex
            : hasImages
              ? null
              : existingMedia.cover_image_index;
        let resolvedCoverImageIndex = null;
        try {
          resolvedCoverImageIndex = resolveCoverImageIndexForWrite({
            images: candidateImages,
            coverImageIndex: candidateCoverImageIndex,
            hasExplicitCoverField: hasCoverImageIndex
          });
        } catch (error) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message || "cover_image_index is invalid"));
        }
        patch.images = candidateImages;
        patch.cover_image_index = resolvedCoverImageIndex;
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "At least one field is required"));
      }

      const updated = await applyDealUpdate({
        dealId,
        agentId: ctx.agentId,
        patch,
        existing
      });

      if (ctx) {
        ctx.auditEvent = "deal.updated";
      }

      const responseDeal = mapDealResponse(updated, { includeImages: true });

      return jsonResponse(200, { deal: responseDeal });
    }

    if (req.method === "DELETE") {
      const existing = await getDealForRemove({ dealId });
      const removed = await removeDeal({
        dealId,
        agentId: ctx.agentId,
        existing
      });

      if (ctx) {
        ctx.auditEvent = "deal.removed";
      }

      return jsonResponse(200, {
        deal: {
          deal_id: removed.deal_id,
          status: removed.status,
          updated_at: removed.updated_at
        }
      });
    }

    const deal = await getDealById({ dealId });

    const responseDeal = mapDealResponse(deal, { includeImages: true });

    return jsonResponse(200, { deal: responseDeal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
