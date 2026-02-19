import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getDealById } from "../../../../../server/services/deal-detail";
import { isUuid } from "../../../../../server/utils/validators";
import { normalizeReadMedia } from "../../../../../server/media/images";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "deal.viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  try {
    const deal = await getDealById({ dealId });
    const media = normalizeReadMedia({
      rawImages: deal?.images,
      rawCoverImageIndex: deal?.cover_image_index
    });

    const responseDeal = {
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
      images: media.images,
      cover_image_index: media.cover_image_index,
      images_count: media.images_count,
      cover_image: media.cover_image,
      created_at: deal.created_at
    };

    return jsonResponse(200, { deal: responseDeal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "deals.read" }));
