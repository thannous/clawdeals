import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { missionError, missionLimit, missionValue, requireMissionOwner } from "../../../../../../server/http/owner-missions";
import { isUuid } from "../../../../../../server/utils/validators";
import { listOwnerBuyMissionMatches } from "../../../../../../server/services/owner-buy-missions";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  const unauthorized = requireMissionOwner(ctx);
  if (unauthorized) return unauthorized;
  const missionId = missionValue(req.query?.mission_id);
  if (!isUuid(missionId)) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "mission_id must be a UUID"));
  try {
    const result = await listOwnerBuyMissionMatches({ ownerId: ctx.ownerId, missionId, cursor: missionValue(req.query?.cursor), limit: missionLimit(req.query?.limit, 20, 30) });
    return jsonResponse(200, result, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return missionError(error);
  }
}

export default withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.read" });
