import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { missionError, missionLimit, missionValue, requireMissionOwner } from "../../../../../server/http/owner-missions";
import { createOwnerBuyMission, listOwnerBuyMissions } from "../../../../../server/services/owner-buy-missions";
import { decodeWatchlistCursor } from "../../../../../server/services/watchlists";
import { isUuid } from "../../../../../server/utils/validators";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(["GET", "POST"]);
  const unauthorized = requireMissionOwner(ctx);
  if (unauthorized) return unauthorized;
  try {
    if (req.method === "GET") {
      const rawCursor = missionValue(req.query?.cursor);
      const decoded = rawCursor ? decodeWatchlistCursor(rawCursor) : null;
      if (decoded?.error) return jsonResponse(400, errorPayload("VALIDATION_ERROR", decoded.error));
      const result = await listOwnerBuyMissions({ ownerId: ctx.ownerId, limit: missionLimit(req.query?.limit), cursor: decoded?.value });
      return jsonResponse(200, result, { "Cache-Control": "no-store" });
    }
    if (!missionValue(req.headers?.["idempotency-key"])) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }
    const expectedOwner = req.headers?.["x-expected-owner-id"];
    if (typeof expectedOwner !== "string" || !isUuid(expectedOwner)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "X-Expected-Owner-Id is required and must be a UUID"), { "Cache-Control": "no-store" });
    }
    // The preflight browser probe can become stale. Compare with this request's
    // authenticated identity before provisioning an agent or inserting a brief.
    if (expectedOwner !== ctx.ownerId) {
      return jsonResponse(403, errorPayload("OWNER_SESSION_CHANGED", "The signed-in owner changed before confirmation"), { "Cache-Control": "no-store" });
    }
    const mission = await createOwnerBuyMission({ ownerId: ctx.ownerId, body: req.body });
    ctx.auditEvent = "owner.mission_created";
    ctx.auditEntityType = "watchlist";
    ctx.auditEntityId = mission.watchlist_id;
    return jsonResponse(201, mission, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return missionError(error);
  }
}

export default withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: true });
