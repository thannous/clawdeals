import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getListing } from "../../../../../server/services/listings";
import { normalizeReadMedia } from "../../../../../server/media/images";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const actorType = ctx?.actor?.type;
  if (actorType !== "owner" && actorType !== "agent") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const id = resolveParam(req.query?.id);
  if (!id || !isUuid(id)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "id must be a valid UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "owner.listing_viewed";
    ctx.auditEntityType = "listing";
    ctx.auditEntityId = id;
  }

  try {
    const listing = await getListing(id);

    if (!listing || listing.owner_id !== ownerId) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const media = normalizeReadMedia({
      rawImages: listing?.photos,
      rawCoverImageIndex: listing?.cover_image_index
    });

    return jsonResponse(200, {
      data: {
        ...listing,
        images: media.images,
        photos: media.images,
        cover_image_index: media.cover_image_index,
        images_count: media.images_count,
        cover_image: media.cover_image
      }
    }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.listings.read",
  enableIdempotency: false
});
