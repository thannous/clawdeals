import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { deleteOwnerListingFollow } from "../../../../../server/services/owner-listing-follows";

function valueOf(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner" || !ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }
  if (!valueOf(req.headers?.["idempotency-key"])) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }
  const watchlistId = valueOf(req.query?.watchlist_id);
  if (!isUuid(watchlistId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "watchlist_id must be a UUID"));
  }

  try {
    const watchlist = await deleteOwnerListingFollow({ ownerId: ctx.ownerId, watchlistId });
    if (!watchlist) return jsonResponse(404, errorPayload("NOT_FOUND", "Watchlist not found"));
    ctx.auditEvent = "owner.listing_unfollowed";
    ctx.auditEntityType = "watchlist";
    ctx.auditEntityId = watchlistId;
    return jsonResponse(200, { data: { watchlist } });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.watchlists.write",
  enableIdempotency: true
});
