import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { projectMissionError, projectMissionId, requireProjectOwner } from "../../../../../../server/http/project-missions";
import { mutateOwnerProjectMission } from "../../../../../../server/services/project-missions";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  const blocked = requireProjectOwner(req, ctx, true);
  if (blocked) return blocked;
  const action = req.query?.action;
  if (!["recalculate", "facts", "select", "confirm", "contact"].includes(action)) return jsonResponse(404, errorPayload("NOT_FOUND", "Project action not found"));
  try {
    const id = projectMissionId(req);
    const result = await mutateOwnerProjectMission(ctx.ownerId, id, action, req.body, ctx, req);
    ctx.auditEvent = `project_mission.${action}`;
    ctx.auditEntityType = "project_mission";
    ctx.auditEntityId = id;
    return jsonResponse(200, result, { "Cache-Control": "private, no-store" });
  } catch (error) { return projectMissionError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableIdempotency: true });
