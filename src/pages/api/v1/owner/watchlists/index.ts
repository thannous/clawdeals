import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import {
  createOwnerListingFollow,
  listOwnerListingFollows
} from "../../../../../server/services/owner-listing-follows";

function valueOf(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function header(req: any, name: string) {
  return valueOf(req.headers?.[name]);
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner" || !ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  if (req.method === "GET") {
    const listingId = valueOf(req.query?.listing_id) || null;
    if (listingId && !isUuid(listingId)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing_id must be a UUID"));
    }
    try {
      const watchlists = await listOwnerListingFollows({ ownerId: ctx.ownerId, listingId });
      ctx.auditEvent = "owner.watchlists_listed";
      ctx.auditEntityType = "owner";
      ctx.auditEntityId = ctx.ownerId;
      return jsonResponse(200, { data: { watchlists } }, { "Cache-Control": "no-store" });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (!header(req, "idempotency-key")) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }
  const listingId = req.body?.listing_id;
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing_id must be a UUID"));
  }

  try {
    const watchlist = await createOwnerListingFollow({ ownerId: ctx.ownerId, listingId });
    ctx.auditEvent = watchlist.created ? "owner.listing_followed" : "owner.listing_follow_exists";
    ctx.auditEntityType = "listing";
    ctx.auditEntityId = listingId;
    return jsonResponse(watchlist.created ? 201 : 200, { data: { watchlist } });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true
});
