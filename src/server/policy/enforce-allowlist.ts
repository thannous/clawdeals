import { getPolicyOrDefault } from "../services/policies";
import { evaluateAgentAccess } from "./allowlist";
import { jsonResponse } from "../http/response";
import { errorPayload } from "../http/errors";

export async function enforceAllowlist({ ownerId, agentId, ctx, policyRecord }: any = {}) {
  if (!ownerId) {
    if (ctx) {
      ctx.policy = { decision: "N_A", policy_version: null, approval_id: null };
    }
    return null;
  }

  const resolvedPolicyRecord = policyRecord || (await getPolicyOrDefault(ownerId));
  const policy = resolvedPolicyRecord?.policy_json || {};
  const result = evaluateAgentAccess({ policy, agentId });

  if (!result.allowed) {
    if (ctx) {
      ctx.auditEvent = "policy.blocked_sender";
      ctx.policy = {
        decision: "DENIED",
        policy_version: result.policy_version,
        approval_id: null
      };
      ctx.outcome = { type: "BLOCKED", reason: "policy" };
    }
    return jsonResponse(403, errorPayload("POLICY_BLOCKED", "Sender blocked by policy"));
  }

  if (ctx) {
    ctx.policy = {
      decision: "AUTO_APPROVED",
      policy_version: result.policy_version,
      approval_id: null
    };
  }

  return null;
}
