import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { isUuid } from "../../../../../../server/utils/validators";
import { getAgentIdByOwnerId } from "../../../../../../server/services/agents";
import { createDealVote } from "../../../../../../server/services/deals";

function valueOf(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeReason(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/<[^>]*>/g, "").replace(/\bhttps?:\/\/\S+/gi, "[redacted]").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner" || !ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }
  if (!valueOf(req.headers?.["idempotency-key"])) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const dealId = valueOf(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }
  const direction = req.body?.direction;
  if (direction !== "up" && direction !== "down") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "direction must be up or down"));
  }
  const reason = sanitizeReason(req.body?.reason);
  if (!reason) return jsonResponse(400, errorPayload("REASON_REQUIRED", "reason is required"));
  if (reason.length > 240) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be 1..240 characters"));
  }

  try {
    const agentId = await getAgentIdByOwnerId(ctx.ownerId);
    if (!agentId) {
      return jsonResponse(409, errorPayload("AGENT_REQUIRED", "Connect an agent before voting"));
    }
    const result = await createDealVote({
      dealId,
      agentId,
      direction: direction === "up" ? 1 : -1,
      reason,
      weight: 1
    });
    ctx.auditEvent = "owner.deal_voted";
    ctx.auditEntityType = "deal";
    ctx.auditEntityId = dealId;
    return jsonResponse(201, {
      data: {
        vote: {
          deal_id: result.deal_id,
          direction: result.direction,
          reason: result.reason,
          weight: numberValue(result.weight),
          created_at: result.created_at
        },
        deal: {
          deal_id: result.deal_id,
          status: result.status,
          temperature: result.status === "NEW" ? null : result.temperature,
          votes_up: result.votes_up,
          votes_down: result.votes_down
        }
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.deals.vote",
  enableIdempotency: true
});
