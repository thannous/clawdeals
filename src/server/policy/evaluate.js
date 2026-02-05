import { createDefaultPolicy, normalizePolicyInput } from "./policy";

export const POLICY_DECISION = {
  AUTO_APPROVED: "AUTO_APPROVED",
  REQUIRES_APPROVAL: "REQUIRES_APPROVAL",
  DENIED: "DENIED",
  N_A: "N_A"
};

function resolvePolicy(policy) {
  const resolved = policy && typeof policy === "object" ? policy : createDefaultPolicy();
  const normalized = normalizePolicyInput(resolved);
  const policyVersion = Number.isInteger(resolved.version) ? resolved.version : 1;
  return { normalized, policyVersion };
}

function buildDecision(decision, reason, policyVersion) {
  return {
    decision,
    reason,
    policy_version: policyVersion
  };
}

function selectOfferLimit(policy) {
  const limits = [];
  if (typeof policy.budgets?.max_offer === "number") {
    limits.push(policy.budgets.max_offer);
  }
  if (typeof policy.approval_thresholds?.offer_amount_gt === "number") {
    limits.push(policy.approval_thresholds.offer_amount_gt);
  }
  if (!limits.length) return null;
  return Math.min(...limits);
}

function evaluateOffer({ policy, policyVersion, offerAmount, offerCurrency }) {
  if (typeof offerAmount !== "number" || Number.isNaN(offerAmount)) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "offer_amount_missing", policyVersion);
  }

  const limit = selectOfferLimit(policy);
  if (limit === null) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "offer_limit_missing", policyVersion);
  }

  if (typeof policy.budgets?.currency === "string" && offerCurrency) {
    if (policy.budgets.currency !== offerCurrency) {
      return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "currency_mismatch", policyVersion);
    }
  }

  if (offerAmount > limit) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "offer_above_limit", policyVersion);
  }

  return buildDecision(POLICY_DECISION.AUTO_APPROVED, "offer_within_limit", policyVersion);
}

function evaluateMessage({ policy, policyVersion, messageType }) {
  if (!messageType) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "message_type_missing", policyVersion);
  }
  const allowlist = policy.auto_approve?.message_types || [];
  if (allowlist.includes(messageType)) {
    return buildDecision(POLICY_DECISION.AUTO_APPROVED, "message_type_allowlisted", policyVersion);
  }
  return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "message_type_not_allowlisted", policyVersion);
}

function evaluateContactReveal({ policy, policyVersion }) {
  const mode = policy.approval_thresholds?.contact_reveal;
  if (mode && mode !== "always") {
    return buildDecision(POLICY_DECISION.AUTO_APPROVED, "contact_reveal_auto", policyVersion);
  }
  return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "contact_reveal_requires_approval", policyVersion);
}

function evaluateGenericAction({ policy, policyVersion, action }) {
  if (!action) {
    return buildDecision(POLICY_DECISION.N_A, "action_missing", policyVersion);
  }
  const allowlist = policy.auto_approve?.actions || [];
  if (allowlist.includes(action)) {
    return buildDecision(POLICY_DECISION.AUTO_APPROVED, "action_allowlisted", policyVersion);
  }
  return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "action_not_allowlisted", policyVersion);
}

export function evaluatePolicyAction({ policy, action, offerAmount, offerCurrency, messageType } = {}) {
  const { normalized, policyVersion } = resolvePolicy(policy);

  if (action === "offer.create") {
    return evaluateOffer({
      policy: normalized,
      policyVersion,
      offerAmount,
      offerCurrency
    });
  }

  if (action === "contact_reveal") {
    return evaluateContactReveal({ policy: normalized, policyVersion });
  }

  if (action === "message.send") {
    return evaluateMessage({ policy: normalized, policyVersion, messageType });
  }

  if (messageType) {
    return evaluateMessage({ policy: normalized, policyVersion, messageType });
  }

  if (typeof offerAmount === "number") {
    return evaluateOffer({
      policy: normalized,
      policyVersion,
      offerAmount,
      offerCurrency
    });
  }

  return evaluateGenericAction({ policy: normalized, policyVersion, action });
}
