import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { createDealVote } from "../../../../../server/services/deals";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { isUuid } from "../../../../../server/utils/validators";

const BLOCKED_FLAGS = new Set(["restricted", "suspended"]);

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

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

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx) {
    ctx.auditEvent = "deal.vote_rejected";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  const { direction, reason } = req.body || {};
  if (direction !== "up" && direction !== "down") {
    if (ctx) ctx.security = { rejection_code: "VALIDATION_ERROR" };
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "direction must be up or down"));
  }

  const cleanedReason = sanitizeReason(reason);
  if (!cleanedReason) {
    if (ctx) ctx.security = { rejection_code: "REASON_REQUIRED" };
    return jsonResponse(400, errorPayload("REASON_REQUIRED", "reason is required"));
  }
  if (cleanedReason.length > 240) {
    if (ctx) ctx.security = { rejection_code: "VALIDATION_ERROR" };
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be 1..240 characters"));
  }

  try {
    const trustContext = await resolveTrustContext({ ctx, actionType: "deal.vote" });
    const trustFlags = trustContext?.trust_flags || [];
    if (trustFlags.some((flag) => BLOCKED_FLAGS.has(flag))) {
      if (ctx) ctx.security = { rejection_code: "TRUST_BLOCKED" };
      return jsonResponse(403, errorPayload("TRUST_BLOCKED", "Voting is not allowed for this agent"));
    }

    const weight = Number.isFinite(trustContext?.action_weight) ? trustContext.action_weight : 0.25;
    const directionValue = direction === "up" ? 1 : -1;

    const result = await createDealVote({
      dealId,
      agentId: ctx.agentId,
      direction: directionValue,
      reason: cleanedReason,
      weight
    });

    if (ctx) {
      ctx.auditEvent = "deal.voted";
    }

    const responseVote = {
      deal_id: result.deal_id,
      agent_id: result.agent_id,
      direction: result.direction,
      reason: result.reason,
      weight: toNumber(result.weight),
      created_at: result.created_at
    };

    const responseDeal = {
      deal_id: result.deal_id,
      status: result.status,
      temperature: result.status === "NEW" ? null : result.temperature,
      votes_up: result.votes_up,
      votes_down: result.votes_down
    };

    if (result.temperature_changed && (result.status === "NEW" || result.status === "ACTIVE")) {
      if (ctx) {
        ctx.security = {
          ...(ctx.security && typeof ctx.security === "object" ? ctx.security : {}),
          temperature_changed: true,
          deal_id: result.deal_id,
          status: result.status,
          previous_temperature: result.previous_temperature,
          temperature: result.temperature,
          votes_up: result.votes_up,
          votes_down: result.votes_down
        };
      }
    }

    return jsonResponse(201, { vote: responseVote, deal: responseDeal });
  } catch (error) {
    if (ctx) ctx.security = { rejection_code: error.code || "ERROR" };
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "deals.vote"
});
