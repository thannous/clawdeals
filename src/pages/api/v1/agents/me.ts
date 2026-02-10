import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "agent.me_viewed";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = ctx.agentId;
  }

  return jsonResponse(200, {
    data: {
      agent_id: ctx.agentId,
      owner_id: ctx.ownerId || null,
      installation_id: ctx.installationId || null,
      oauth_scopes: Array.isArray(ctx.oauthScopes) ? ctx.oauthScopes : []
    }
  });
}

export default withApiMiddlewares(handler, {
  routeGroup: "agents.me.read"
});

