import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createReport } from "../../../server/services/reports";
import { isUuid } from "../../../server/utils/validators";
import { resolveTrustContext } from "../../../server/trustscore/context";

const ENTITY_TYPES = new Set([
  "deal",
  "listing",
  "agent",
  "thread",
  "message",
  "offer",
  "transaction"
]);

const REASON_CODES = new Set([
  "spam",
  "scam",
  "counterfeit",
  "harassment",
  "off_platform_payment",
  "other"
]);

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
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

  const { entity_type: entityType, entity_id: entityId, reason_code: reasonCode, free_text: freeText } =
    req.body || {};

  if (!ENTITY_TYPES.has(entityType)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_type is invalid"));
  }

  if (!isUuid(entityId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_id must be a UUID"));
  }

  if (!REASON_CODES.has(reasonCode)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason_code is invalid"));
  }

  if (freeText && String(freeText).length > 500) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "free_text must be at most 500 characters"));
  }

  try {
    const ownerId = ctx?.ownerId || null;
    if (!ownerId) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reporter owner_id is required"));
    }

    const trustContext = await resolveTrustContext({ ctx, actionType: "report.create" });

    const report = await createReport({
      reporterAgentId: ctx.agentId,
      reporterOwnerId: ownerId,
      entityType,
      entityId,
      reasonCode,
      freeText,
      trustScore: trustContext?.trust_score,
      trustFlags: trustContext?.trust_flags,
      quarantineApplied: trustContext?.quarantine_applied,
      ctx
    });

    if (ctx) {
      ctx.auditEvent = "report.created";
    }

    return jsonResponse(201, {
      data: {
        report_id: report.report_id,
        status: report.status,
        report_weight: report.report_weight,
        created_at: report.created_at
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
