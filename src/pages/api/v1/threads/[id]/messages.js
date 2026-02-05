import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors.js";
import { createMessage, getThread } from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";
import { enforceAllowlist } from "../../../../../server/policy/enforce-allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { createApproval } from "../../../../../server/services/approvals";
import crypto from "crypto";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const rawId = req.query?.id;
  const threadId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread id must be a UUID"));
  }

  const { body, message_type: messageType } = req.body || {};
  if (!body) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "body is required"));
  }
  if (!messageType || typeof messageType !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "message_type is required"));
  }

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const agentId = ctx?.agentId || null;
    const ownerId = ctx?.ownerId || null;
    const targetOwnerId = thread.owner_id || ownerId || null;

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
          message_type: messageType
        };
        const hashInput = `${threadId}:${agentId || ""}:${messageType}:${body}`;
        const actionRefId = crypto.createHash("sha256").update(hashInput).digest("hex");

        const approval = await createApproval({
          ownerId: targetOwnerId,
          actionType: "message.send",
          actionRef,
          actionRefId,
          actionPayload: { body },
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

    const senderId = agentId || ownerId || null;
    const senderType = agentId ? "agent" : "owner";

    const message = await createMessage({ threadId, body, senderId, senderType, messageType });
    return jsonResponse(201, { data: message });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
