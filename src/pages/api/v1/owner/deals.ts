import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { listDealsByOwner } from "../../../../server/services/deals-list";

const VALID_STATUSES = new Set(["NEW", "ACTIVE", "EXPIRED"]);

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function decodeOwnerDealsCursor(raw: string) {
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") return { error: "Invalid cursor" };
    if (typeof parsed.created_at !== "string" || typeof parsed.deal_id !== "string") return { error: "Invalid cursor" };
    return { value: { created_at: parsed.created_at, deal_id: parsed.deal_id } };
  } catch {
    return { error: "Invalid cursor" };
  }
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

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

  const rawStatus = resolveParam(req.query?.status);
  const status = rawStatus ? String(rawStatus).toUpperCase() : null;
  if (status && !VALID_STATUSES.has(status)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status is invalid"));
  }

  let limit = 50;
  const rawLimit = resolveParam(req.query?.limit);
  if (rawLimit !== null && rawLimit !== "") {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > 100) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be between 1 and 100"));
    }
    limit = parsed;
  }

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeOwnerDealsCursor(rawCursor);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || null;
  }

  const rawAgentId = resolveParam(req.query?.agent_id);
  const agentId = rawAgentId ? String(rawAgentId) : null;
  if (agentId && !isUuid(agentId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "owner.deals_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const result = await listDealsByOwner({ ownerId, status, limit, cursor, creatorAgentId: agentId });

    return jsonResponse(200, {
      data: {
        deals: result.items,
        next_cursor: result.nextCursor
      }
    }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.deals.read",
  enableIdempotency: false
});
