import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listPolicyDecisionsForOwner } from "../../../../server/services/policy-decisions";
import { isUuid } from "../../../../server/utils/validators";

const MAX_LIMIT = 20;
const MAX_REQUEST_ID_LENGTH = 160;

function resolveParam(value: any): string | null {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : null;
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner" || !ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const rawLimit = resolveParam(req.query?.limit);
  const limit = rawLimit === null ? MAX_LIMIT : Number.parseInt(rawLimit, 10);
  if (
    !Number.isInteger(limit) ||
    (rawLimit !== null && String(limit) !== rawLimit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${MAX_LIMIT}`));
  }

  const requestId = resolveParam(req.query?.request_id);
  if (requestId && requestId.length > MAX_REQUEST_ID_LENGTH) {
    return jsonResponse(
      400,
      errorPayload("VALIDATION_ERROR", `request_id must be at most ${MAX_REQUEST_ID_LENGTH} characters`)
    );
  }

  try {
    const decisions = await listPolicyDecisionsForOwner({ ownerId: ctx.ownerId, limit, requestId });
    if (ctx) {
      ctx.auditEvent = "owner.policy_decisions_listed";
      ctx.auditEntityType = "owner";
      ctx.auditEntityId = ctx.ownerId;
    }
    return jsonResponse(
      200,
      { data: { owner_id: ctx.ownerId, decisions } },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.policy_decisions.read",
  enableIdempotency: false
});
