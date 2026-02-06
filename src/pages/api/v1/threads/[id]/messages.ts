import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { createMessage, createSystemWarningMessage, getThread } from "../../../../../server/services/threads";
import { getListing } from "../../../../../server/services/listings";
import { isUuid } from "../../../../../server/utils/validators";
import { enforceAllowlist } from "../../../../../server/policy/enforce-allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { createApproval } from "../../../../../server/services/approvals";
import crypto from "crypto";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { computeMessageBodyHmac, redactMessageText, TEXT_MESSAGE_TYPES } from "../../../../../server/messaging/redaction";
import { isTypedMessageParseError, parseTypedMessage } from "../../../../../server/messaging/typed-message";
import { publishSseEvent } from "../../../../../server/sse/store";
import { canonicalJsonStringify } from "../../../../../server/utils/canonical-json";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function mapMessageResponse(message: any) {
  return {
    message_id: message.message_id,
    thread_id: message.thread_id,
    sender_type: message.sender_type,
    sender_id: message.sender_id,
    type: message.type,
    payload: message.payload,
    redacted: Boolean(message.redacted),
    created_at: message.created_at
  };
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

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const rawId = req.query?.id;
  const threadId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread id must be a UUID"));
  }

  const parsed = parseTypedMessage(req.body || {});
  if (isTypedMessageParseError(parsed)) {
    return jsonResponse(400, errorPayload(parsed.error.code, parsed.error.message, parsed.error.details));
  }

  const messageType: any = parsed.value.type;
  const messagePayload: any = parsed.value.payload;

  let redaction: any = null;
  let originalHmac: string | null = null;
  let redactedPayload: any = messagePayload;
  let primaryReason: string | null = null;

  // Redact any user-supplied message text, regardless of type, to avoid bypasses.
  // (Schema validation should constrain which types can contain text.)
  if (messagePayload && typeof messagePayload.text === "string") {
    const text = messagePayload.text;
    originalHmac = computeMessageBodyHmac(text);
    redaction = redactMessageText(text);
    primaryReason = redaction.reasons?.[0] || null;
    redactedPayload = redaction.redacted ? { ...messagePayload, text: redaction.text } : messagePayload;
  }

  // Ensure request-level audit never stores plaintext message text.
  if (ctx) {
    ctx.body = {
      thread_id: threadId,
      message: {
        type: messageType,
        original_hmac: originalHmac,
        payload_redacted: redactedPayload,
        redaction_applied: Boolean(redaction?.redacted),
        redaction_reasons: redaction?.reasons || []
      }
    };
  }

  try {
    const threadPromise = getThread(threadId);
    const trustPromise = resolveTrustContext({ ctx, actionType: "message.send" });
    const [thread] = await Promise.all([threadPromise, trustPromise]);

    if (!thread) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const isBuyer = thread.buyer_agent_id === agentId;
    const isSeller = thread.seller_agent_id === agentId;
    if (!isBuyer && !isSeller) {
      // Anti-enumeration: pretend it doesn't exist.
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const listing = thread.listing_id ? await getListing(thread.listing_id) : null;
    if (!listing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const targetOwnerId = listing.owner_id || null;

    // Apply allowlist + message policy only for buyer -> seller messages.
    if (isBuyer && targetOwnerId) {
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
        action: "message.send",
        messageType
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
          thread_id: threadId,
          owner_id: targetOwnerId,
          agent_id: agentId || null,
          message_type: messageType,
          message_redacted: Boolean(redaction?.redacted),
          redaction_reason: primaryReason,
          original_hmac: originalHmac
        };

        const hashInput = `${threadId}:${agentId || ""}:${messageType}:${canonicalJsonStringify(redactedPayload)}`;
        const actionRefId = crypto.createHash("sha256").update(hashInput).digest("hex");

        const approval = await createApproval({
          ownerId: targetOwnerId,
          actionType: "message.send",
          actionRef,
          actionRefId,
          actionPayload: { payload: redactedPayload },
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

    const message = await createMessage({
      threadId,
      senderId: agentId,
      senderType: "agent",
      type: messageType,
      payload: redactedPayload,
      redacted: Boolean(redaction?.redacted)
    });

    if (ctx) {
      ctx.auditEvent = redaction?.redacted ? "message.redacted" : "message.sent";
    }

    if (redaction?.redacted) {
      await createSystemWarningMessage({ threadId });
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: redaction?.redacted ? "message.redacted" : "message.sent",
        actor: { type: "agent", id: agentId },
        entity: { type: "message", id: message.message_id },
        payload: { thread_id: threadId, message_type: messageType, redacted: Boolean(redaction?.redacted) }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "message.sent", error: error?.message || String(error) });
    }

    return jsonResponse(201, mapMessageResponse(message));
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
