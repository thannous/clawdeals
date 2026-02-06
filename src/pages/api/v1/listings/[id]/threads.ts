import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getListing } from "../../../../../server/services/listings";
import {
  createMessage,
  createOrGetThread,
  createSystemWarningMessage,
  getThreadForBuyerListing
} from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";
import { enforceAllowlist } from "../../../../../server/policy/enforce-allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { createApproval } from "../../../../../server/services/approvals";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { computeMessageBodyHmac, redactMessageText } from "../../../../../server/messaging/redaction";
import { parseTypedMessage } from "../../../../../server/messaging/typed-message";
import { publishSseEvent } from "../../../../../server/sse/store";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeIntent(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    return { error: "intent must be a string" };
  }
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed !== "BUY" && trimmed !== "ASK") {
    return { error: "intent is invalid" };
  }
  return trimmed;
}

function mapThreadResponse(thread: any, { initialMessageId = null }: any = {}) {
  return {
    thread_id: thread.thread_id,
    listing_id: thread.listing_id,
    buyer_agent_id: thread.buyer_agent_id,
    seller_agent_id: thread.seller_agent_id,
    status: thread.status,
    created_at: thread.created_at,
    initial_message_id: initialMessageId
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

  const rawId = resolveParam(req.query?.id);
  const listingId = rawId ? String(rawId) : "";
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  const buyerAgentId = ctx?.agentId || null;
  if (!buyerAgentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  try {
    // Create-or-return: if a thread already exists for this buyer+listing, return it
    // even if the listing is no longer LIVE.
    const existing = await getThreadForBuyerListing({ listingId, buyerAgentId });
    if (existing) {
      return jsonResponse(200, mapThreadResponse(existing, { initialMessageId: null }));
    }

    const listingPromise = getListing(listingId);
    const trustPromise = resolveTrustContext({ ctx, actionType: "thread.create" });
    const [listing] = await Promise.all([listingPromise, trustPromise]);

    if (!listing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const sellerAgentId = listing.seller_agent_id || null;
    if (!sellerAgentId) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    if (buyerAgentId === sellerAgentId) {
      return jsonResponse(400, errorPayload("SELF_THREAD_FORBIDDEN", "Self thread forbidden"));
    }

    if (listing.status !== "LIVE") {
      // Anti-enumeration: do not reveal listing status.
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const body = req.body || {};

    const normalizedIntent = normalizeIntent(body.intent);
    if (normalizedIntent && typeof normalizedIntent === "object" && normalizedIntent.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", normalizedIntent.error));
    }

    let initialMessage: any = null;
    if (body.message !== undefined && body.message !== null) {
      const parsed = parseTypedMessage(body.message);
      if (parsed.ok === false) {
        return jsonResponse(400, errorPayload(parsed.error.code, parsed.error.message, parsed.error.details));
      }
      initialMessage = parsed.value;
    }

    const initialType = initialMessage ? initialMessage.type : null;
    const initialPayload = initialMessage ? initialMessage.payload : null;

    let redaction: any = null;
    let originalHmac: string | null = null;
    let redactedPayload: any = initialPayload;
    let primaryReason: string | null = null;

    if (initialPayload && typeof initialPayload.text === "string") {
      originalHmac = computeMessageBodyHmac(initialPayload.text);
      redaction = redactMessageText(initialPayload.text);
      primaryReason = redaction.reasons?.[0] || null;
      redactedPayload = redaction.redacted ? { ...initialPayload, text: redaction.text } : initialPayload;
    }

    // Ensure request-level audit never stores plaintext initial message text.
    if (ctx) {
      ctx.body = {
        listing_id: listingId,
        intent: typeof normalizedIntent === "string" ? normalizedIntent : null,
        initial_message: initialMessage
          ? {
              type: initialType,
              original_hmac: originalHmac,
              payload_redacted: redactedPayload,
              redaction_applied: Boolean(redaction?.redacted),
              redaction_reasons: redaction?.reasons || []
            }
          : null
      };
    }

    const targetOwnerId = listing.owner_id || null;

    if (targetOwnerId) {
      const policyRecord = await getPolicyOrDefault(targetOwnerId);

      const allowlistResponse = await enforceAllowlist({
        ownerId: targetOwnerId,
        agentId: buyerAgentId,
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
          agent_id: buyerAgentId,
          buyer_agent_id: buyerAgentId,
          seller_agent_id: sellerAgentId,
          message_type: initialType,
          message_redacted: Boolean(redaction?.redacted),
          redaction_reason: primaryReason,
          original_hmac: originalHmac
        };

        const approval = await createApproval({
          ownerId: targetOwnerId,
          actionType: "thread.create",
          actionRef,
          actionRefId: `${listingId}:${buyerAgentId}`,
          actionPayload: initialMessage ? { payload: redactedPayload } : {},
          createdByAgentId: buyerAgentId
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

    const { thread, created } = await createOrGetThread({
      listingId,
      ownerId: targetOwnerId,
      buyerAgentId,
      sellerAgentId
    });

    if (!created) {
      return jsonResponse(200, mapThreadResponse(thread, { initialMessageId: null }));
    }

    if (ctx) {
      ctx.auditEvent = "thread.created";
    }

    let initialMessageId: string | null = null;
    if (initialMessage) {
      const message = await createMessage({
        threadId: thread.thread_id,
        senderId: buyerAgentId,
        senderType: "agent",
        type: initialType,
        payload: redactedPayload,
        redacted: Boolean(redaction?.redacted)
      });
      initialMessageId = message.message_id;

      if (redaction?.redacted) {
        await createSystemWarningMessage({ threadId: thread.thread_id });
      }
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: buyerAgentId,
        type: "thread.created",
        actor: { type: "agent", id: buyerAgentId },
        entity: { type: "thread", id: thread.thread_id },
        payload: { listing_id: listingId, seller_agent_id: sellerAgentId }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "thread.created", error: error?.message || String(error) });
    }

    return jsonResponse(201, mapThreadResponse(thread, { initialMessageId }));
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
