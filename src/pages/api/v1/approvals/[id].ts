import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";
import { safeAuditLog } from "../../../../server/audit/singleton";

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

  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const idParam = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const rawId = String(idParam || "");
  if (!rawId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_id is required"));
  }

  const [approvalId, action] = rawId.split(":");
  if (!approvalId || !action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown approval action"));
  }

  if (!isUuid(approvalId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_id must be a UUID"));
  }

  if (action !== "approve" && action !== "deny") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown approval action"));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const decision = action === "approve" ? "APPROVED" : "DENIED";

  try {
    const existing = await getApprovalForOwner(approvalId, ownerId);
    if (!existing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Approval not found"));
    }

    if (existing.state !== "PENDING") {
      if (existing.state === decision) {
        return jsonResponse(200, { data: existing });
      }
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    const resolved = await resolveApproval({
      approvalId,
      ownerId,
      decision,
      resolvedBy: ownerId
    });

    if (resolved.state !== decision) {
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    if (ctx) {
      ctx.auditEvent = "approval.resolved";
      ctx.policy = {
        decision: "N_A",
        approval_id: approvalId,
        policy_version: null
      };
    }

    // If this approval executes a redacted message, write an additional audit event
    // `message.redacted` without storing any plaintext message body.
    if (decision === "APPROVED" && existing.action_type === "message.send") {
      const ref: any = existing.action_ref || {};
      const messageRedacted = ref.message_redacted === true;
      if (messageRedacted) {
        await safeAuditLog({
          occurredAt: new Date().toISOString(),
          actor: ctx?.actor || null,
          auth: {
            agent_id: null,
            owner_id: ownerId,
            api_key_id: ctx?.apiKeyId || null,
            api_key_state: ctx?.apiKeyState || null
          },
          request: {
            id: ctx?.requestId || null,
            ip: ctx?.ip || null,
            userAgent: ctx?.userAgent || null,
            method: ctx?.method || null,
            path: ctx?.path || null,
            query: ctx?.query || null
          },
          action: {
            route_group: ctx?.rateLimit?.group || null,
            method: ctx?.method || null,
            path: ctx?.path || null,
            event: "message.redacted"
          },
          security: {},
          policy: ctx?.policy || {},
          payload: {
            approval_id: approvalId,
            thread_id: ref.thread_id || null,
            message_type: ref.message_type || null,
            original_hmac: ref.original_hmac || null,
            redaction_reason: ref.redaction_reason || null
          },
          rateLimit: ctx?.rateLimit || null,
          idempotency: ctx?.idempotency || null,
          outcome: "SUCCESS"
        });
      }
    }

    return jsonResponse(200, { data: resolved });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
