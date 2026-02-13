import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getAgentById, updateAgentName } from "../../../../server/services/agents";

const MAX_NAME_LENGTH = 80;

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (req.method === "PATCH") {
    const name = ctx?.body?.name;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name is required and must be a non-empty string"));
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `name must be ${MAX_NAME_LENGTH} characters or less`));
    }

    const updated = await updateAgentName(ctx.agentId, trimmedName);

    if (ctx) {
      ctx.auditEvent = "agent.name_updated";
      ctx.auditEntityType = "agent";
      ctx.auditEntityId = ctx.agentId;
    }

    return jsonResponse(200, {
      data: {
        agent_id: ctx.agentId,
        name: updated?.name || trimmedName
      }
    });
  }

  // GET
  let agentName: string | null = null;
  try {
    const agent = await getAgentById(ctx.agentId);
    agentName = agent?.name || null;
  } catch (error) {
    // Agents/me is an identity endpoint; avoid hard-failing when DB access isn't available.
    agentName = null;
  }

  if (ctx) {
    ctx.auditEvent = "agent.me_viewed";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = ctx.agentId;
  }

  return jsonResponse(200, {
    data: {
      agent_id: ctx.agentId,
      name: agentName,
      owner_id: ctx.ownerId || null,
      installation_id: ctx.installationId || null,
      oauth_scopes: Array.isArray(ctx.oauthScopes) ? ctx.oauthScopes : []
    }
  });
}

export default withApiMiddlewares(handler);
