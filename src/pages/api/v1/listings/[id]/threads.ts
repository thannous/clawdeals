import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { createMessage, createSystemWarningMessage, createThread } from "../../../../../server/services/threads";
import { getListing } from "../../../../../server/services/listings";
import { isUuid } from "../../../../../server/utils/validators";
import { enforceAllowlist } from "../../../../../server/policy/enforce-allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { createApproval } from "../../../../../server/services/approvals";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { computeMessageBodyHmac, redactMessageText, TEXT_MESSAGE_TYPES } from "../../../../../server/messaging/redaction";

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const rawId = req.query?.id;
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  const { body, message_type: messageType } = req.body || {};
  const hasInitialMessage = body !== undefined || messageType !== undefined;
  if (hasInitialMessage) {
    if (typeof body !== "string" || !body) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "body must be a non-empty string when message_type is provided"));
    }
    if (!messageType || typeof messageType !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "message_type is required when body is provided"));
    }
  }

  const shouldApplyRedaction = hasInitialMessage && TEXT_MESSAGE_TYPES.has(messageType);
  const redaction = hasInitialMessage && shouldApplyRedaction
    ? redactMessageText(body)
    : hasInitialMessage
      ? { text: body, redacted: false, reasons: [], matchCount: 0 }
      : null;
  const originalHmac = hasInitialMessage ? computeMessageBodyHmac(body) : null;
  const bodyToStore = hasInitialMessage ? (redaction ? redaction.text : body) : null;
  const primaryReason = redaction?.reasons?.[0] || null;

  // Ensure request-level audit never stores plaintext initial message body.
  if (ctx) {
    ctx.body = {
      listing_id: listingId,
      initial_message: hasInitialMessage
        ? {
            message_type: messageType,
            body_hmac: originalHmac,
            body_redacted: bodyToStore,
            redaction_applied: Boolean(redaction?.redacted),
            redaction_reasons: redaction?.reasons || []
          }
        : null
    };
  }

  try {
    const listingPromise = getListing(listingId);
    const trustPromise = resolveTrustContext({ ctx, actionType: "thread.create" });

    const [listing] = await Promise.all([listingPromise, trustPromise]);
    if (!listing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const ownerId = ctx?.ownerId || null;
    const agentId = ctx?.agentId || null;
    const targetOwnerId = listing.owner_id || ownerId || null;

    if (targetOwnerId) {
      const policyRecord = await getPolicyOrDefault(targetOwnerId);
      const allowlistResponse = await enforceAllowlist({
        ownerId: targetOwnerId,
        agentId,
        ctx,
        policyRecord
      });
      if (allowlistResponse) {
        return allowlistResponse;
      }

      const policyDecision = evaluatePolicyAction({
        policy: policyRecord?.policy_json || {},
        action: "thread.create"
      });

      if (ctx) {
        ctx.policy = {
          decision: policyDecision.decision,
          policy_version: policyDecision.policy_version,
          approval_id: null
        };
      }

      if (policyDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL) {
        const actionRef = {
          listing_id: listingId,
          owner_id: targetOwnerId,
          agent_id: agentId || null,
          message_type: hasInitialMessage ? messageType : null,
          message_redacted: Boolean(redaction?.redacted),
          redaction_reason: primaryReason,
          original_hmac: originalHmac
        };

        const approval = await createApproval({
          ownerId: targetOwnerId,
          actionType: "thread.create",
          actionRef,
          actionRefId: `${listingId}:${agentId || ""}`,
          actionPayload: hasInitialMessage ? { body: bodyToStore } : {},
          createdByAgentId: agentId
        });

        if (ctx) {
          ctx.auditEvent = "approval.created";
          ctx.outcome = { type: "BLOCKED", reason: "policy" };
          ctx.policy = {
            decision: policyDecision.decision,
            policy_version: policyDecision.policy_version,
            approval_id: approval.approval_id
          };
        }

        return jsonResponse(202, {
          data: {
            approval_id: approval.approval_id,
            state: approval.state,
            action_type: approval.action_type,
            action_ref: approval.action_ref
          }
        });
      }
    } else if (ctx) {
      ctx.policy = { decision: "N_A", policy_version: null, approval_id: null };
    }

    const thread = await createThread({
      listingId,
      ownerId: targetOwnerId || ownerId,
      agentId
    });

    if (ctx) {
      ctx.auditEvent = "thread.created";
    }

    if (hasInitialMessage) {
      const senderId = agentId || ownerId || null;
      const senderType = agentId ? "agent" : "owner";
      await createMessage({
        threadId: thread.id,
        body: bodyToStore,
        senderId,
        senderType,
        messageType,
        redacted: Boolean(redaction?.redacted)
      });
      if (redaction?.redacted) {
        await createSystemWarningMessage({ threadId: thread.id });
      }
    }
    return jsonResponse(201, { data: thread });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
