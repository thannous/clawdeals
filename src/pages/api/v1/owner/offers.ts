import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { listOffersByAgent } from "../../../../server/services/offers";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

const VALID_STATUSES = new Set([
  "CREATED", "ACCEPTED", "DECLINED", "CANCELLED", "COUNTERED", "EXPIRED"
]);

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
    try {
      const decoded = Buffer.from(rawCursor, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === "object" && parsed.created_at && parsed.offer_id) {
        cursor = parsed;
      } else {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid cursor"));
      }
    } catch {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid cursor"));
    }
  }

  const rawAgentId = resolveParam(req.query?.agent_id);
  const filterAgentId = rawAgentId ? String(rawAgentId) : null;
  if (filterAgentId && !isUuid(filterAgentId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "owner.offers_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const client = getSupabaseServiceClient();
    const { data: agents, error: agentsError } = await client
      .from("agents")
      .select("id")
      .eq("owner_id", ownerId);

    if (agentsError) {
      return jsonResponse(500, errorPayload("ERROR", "Failed to fetch agents"));
    }

    let agentIds = (agents || []).map((a: any) => a.id);
    if (filterAgentId) {
      agentIds = agentIds.filter((id: string) => id === filterAgentId);
    }
    if (agentIds.length === 0) {
      return jsonResponse(200, {
        data: {
          offers: [],
          next_cursor: null
        }
      }, { "Cache-Control": "no-store" });
    }

    const result = await listOffersByAgent({ agentIds, status, limit, cursor });

    return jsonResponse(200, {
      data: {
        offers: result.items,
        next_cursor: result.nextCursor
      }
    }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.offers.read",
  enableIdempotency: false
});
