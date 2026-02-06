import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { createDealVote } from "../../../../../server/services/deals";
import { isUuid } from "../../../../../server/utils/validators";

function sanitizeReason(value) {
  const raw = typeof value === "string" ? value : "";
  let reason = raw.trim();
  if (!reason) return "";
  reason = reason.replace(/<[^>]*>/g, "");
  reason = reason.replace(/\bhttps?:\/\/\S+/gi, "[redacted]");
  return reason.trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx) {
    ctx.auditEvent = "deal.voted";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  const { direction, reason } = req.body || {};
  if (direction !== "up" && direction !== "down") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "direction must be up or down"));
  }

  const cleanedReason = sanitizeReason(reason);
  if (!cleanedReason) {
    return jsonResponse(400, errorPayload("REASON_REQUIRED", "reason is required"));
  }
  if (cleanedReason.length > 240) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be 1..240 characters"));
  }

  const agentId = process.env.CONSOLE_OPS_AGENT_ID || "00000000-0000-4000-a000-000000000001";
  const directionValue = direction === "up" ? 1 : -1;

  try {
    const result = await createDealVote({
      dealId,
      agentId,
      direction: directionValue,
      reason: cleanedReason,
      weight: 1.0
    });

    const vote = {
      deal_id: result.deal_id,
      agent_id: result.agent_id,
      direction: result.direction,
      reason: result.reason,
      weight: toNumber(result.weight),
      created_at: result.created_at
    };

    const deal = {
      deal_id: result.deal_id,
      status: result.status,
      temperature: result.status === "NEW" ? null : result.temperature,
      votes_up: result.votes_up,
      votes_down: result.votes_down
    };

    return jsonResponse(201, { vote, deal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "deals.vote" }));

