import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { projectMissionError, projectMissionId, requireProjectOwner } from "../../../../../../server/http/project-missions";
import { listProjectConversations } from "../../../../../../server/services/project-missions";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = requireProjectOwner(req, ctx);
  if (blocked) return blocked;
  try {
    return jsonResponse(200, await listProjectConversations(ctx.ownerId, projectMissionId(req)), { "Cache-Control": "private, no-store" });
  } catch (error) { return projectMissionError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.read" });
