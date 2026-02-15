import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { APPROVALS_MAX_LIMIT, decodeApprovalCursor, listApprovals } from "../../../../server/services/approvals";

const STATES = new Set(["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"]);

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  // v0 WebMCP uses agent API keys in-browser; allow agent actor if it carries an owner_id in ctx.
  const actorType = ctx?.actor?.type;
  if (actorType !== "owner" && actorType !== "agent") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const rawState = req.query?.state;
  const state = Array.isArray(rawState) ? rawState[0] : rawState;
  if (state && !STATES.has(String(state).toUpperCase())) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "state is invalid"));
  }

  const rawLimit = req.query?.limit;
  const limitValue = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  let limit = 50;
  if (limitValue !== undefined && limitValue !== null && limitValue !== "") {
    const parsed = Number.parseInt(limitValue, 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > APPROVALS_MAX_LIMIT) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${APPROVALS_MAX_LIMIT}`)
      );
    }
    limit = parsed;
  }

  const rawCursor = req.query?.cursor;
  const cursorValue = Array.isArray(rawCursor) ? rawCursor[0] : rawCursor;
  let cursor = null;
  if (cursorValue) {
    const parsed = decodeApprovalCursor(cursorValue);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || null;
  }

  const rawAgentId = req.query?.agent_id;
  const agentIdValue = Array.isArray(rawAgentId) ? rawAgentId[0] : rawAgentId;
  const agentId = agentIdValue ? String(agentIdValue) : null;
  if (agentId && !isUuid(agentId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  try {
    const result = await listApprovals({
      ownerId,
      state: state ? String(state).toUpperCase() : null,
      limit,
      cursor,
      agentId
    });

    return jsonResponse(200, {
      data: {
        approvals: result.approvals,
        next_cursor: result.nextCursor
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "approvals.read",
  enableIdempotency: false
});
