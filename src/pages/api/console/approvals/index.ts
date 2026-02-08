import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listAllApprovals, decodeApprovalCursor } from "../../../../server/services/approvals";
import { isUuid } from "../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "approvals.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const state = resolveParam(req.query?.state) || "PENDING";
  const actionType = resolveParam(req.query?.action_type) || null;

  const agentId = resolveParam(req.query?.agent_id) || null;
  if (agentId && !isUuid(agentId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  const limitRaw = resolveParam(req.query?.limit);
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
    const parsed = Number.parseInt(String(limitRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > MAX_LIMIT) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${MAX_LIMIT}`));
    }
    limit = parsed;
  }

  const cursorRaw = resolveParam(req.query?.cursor);
  let cursor = null;
  if (cursorRaw) {
    const parsed = decodeApprovalCursor(cursorRaw);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || null;
  }

  try {
    const result = await listAllApprovals({
      state, actionType, createdByAgentId: agentId, limit, cursor
    });
    return jsonResponse(200, { items: result.approvals, next_cursor: result.nextCursor });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "approvals.read" }));
