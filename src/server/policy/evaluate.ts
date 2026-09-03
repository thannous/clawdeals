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

function timeInMinutes(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function parseTime(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isQuietHoursActive(quietHours, now) {
  if (quietHours?.enabled !== true) return false;
  const current = timeInMinutes(now, quietHours.timezone || "UTC");
  const start = parseTime(quietHours.start);
  const end = parseTime(quietHours.end);
  if (current === null || start === null || end === null || start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function evaluateOffer({ policy, policyVersion, offerAmount, offerCurrency, now }) {
  if (!policy.mission_defaults?.autonomous_actions?.includes("make_offer")) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "offer_autonomy_disabled", policyVersion);
  }

  if (isQuietHoursActive(policy.quiet_hours, now)) {
    return buildDecision(POLICY_DECISION.REQUIRES_APPROVAL, "quiet_hours_active", policyVersion);
  }

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

export function evaluatePolicyAction({
  policy,
  action,
  offerAmount,
  offerCurrency,
  messageType,
  now = new Date()
}: any = {}) {
  const { normalized, policyVersion } = resolvePolicy(policy);

  if (action === "offer.create") {
    return evaluateOffer({
      policy: normalized,
      policyVersion,
      offerAmount,
      offerCurrency,
      now
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
      offerCurrency,
      now
    });
  }

  return evaluateGenericAction({ policy: normalized, policyVersion, action });
}
