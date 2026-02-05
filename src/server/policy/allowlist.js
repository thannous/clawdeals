import { createDefaultPolicy, normalizePolicyInput } from "./policy";

export function evaluateAgentAccess({ policy, agentId } = {}) {
  const resolvedPolicy = policy && typeof policy === "object" ? policy : createDefaultPolicy();
  const normalized = normalizePolicyInput(resolvedPolicy);
  const policyVersion = Number.isInteger(resolvedPolicy.version) ? resolvedPolicy.version : 1;

  if (!agentId) {
    return {
      allowed: true,
      decision: "ALLOW",
      reason: "no_agent_id",
      policy_version: policyVersion
    };
  }

  const denylist = normalized.denylist_agent_ids || [];
  if (denylist.includes(agentId)) {
    return {
      allowed: false,
      decision: "DENY",
      reason: "denylisted",
      policy_version: policyVersion
    };
  }

  const allowlist = normalized.allowlist_agent_ids || [];
  if (allowlist.length > 0 && !allowlist.includes(agentId)) {
    return {
      allowed: false,
      decision: "DENY",
      reason: "not_allowlisted",
      policy_version: policyVersion
    };
  }

  return {
    allowed: true,
    decision: "ALLOW",
    reason: allowlist.length > 0 ? "allowlisted" : "allowlist_empty",
    policy_version: policyVersion
  };
}
