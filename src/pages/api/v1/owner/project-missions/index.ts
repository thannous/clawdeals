import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { projectMissionError, requireProjectOwner } from "../../../../../server/http/project-missions";
import { createOwnerProjectMission, listOwnerProjectMissions } from "../../../../../server/services/project-missions";

export async function handler(req: any, _res: any, ctx: any) {
  if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(["GET", "POST"]);
  const blocked = requireProjectOwner(req, ctx, req.method === "POST");
  if (blocked) return blocked;
  try {
    const result = req.method === "GET" ? await listOwnerProjectMissions(ctx.ownerId) : await createOwnerProjectMission(ctx.ownerId, req.body, req.headers["idempotency-key"]);
    ctx.auditEvent = req.method === "GET" ? "project_mission.list" : "project_mission.created";
    return jsonResponse(req.method === "GET" ? 200 : 201, result, { "Cache-Control": "private, no-store" });
  } catch (error) { return projectMissionError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableIdempotency: true });
