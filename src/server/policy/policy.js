const DEFAULT_CONTACT_REVEAL = "always";
const DEFAULT_POLICY_VERSION = 1;

const POLICY_SHAPE = {
  budgets: {
    max_offer: null,
    currency: null
  },
  approval_thresholds: {
    offer_amount_gt: null,
    contact_reveal: DEFAULT_CONTACT_REVEAL
  },
  auto_approve: {
    message_types: [],
    actions: []
  },
  allowlist_agent_ids: [],
  denylist_agent_ids: []
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  value.forEach((entry) => {
    if (typeof entry !== "string") return;
    const trimmed = entry.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

function normalizeNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function normalizeCurrency(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizePolicyInput(input) {
  const source = isPlainObject(input) ? input : {};
  const budgets = isPlainObject(source.budgets) ? source.budgets : {};
  const approvalThresholds = isPlainObject(source.approval_thresholds)
    ? source.approval_thresholds
    : {};
  const autoApprove = isPlainObject(source.auto_approve) ? source.auto_approve : {};

  return {
    budgets: {
      max_offer: normalizeNumber(budgets.max_offer),
      currency: normalizeCurrency(budgets.currency)
    },
    approval_thresholds: {
      offer_amount_gt: normalizeNumber(approvalThresholds.offer_amount_gt),
      contact_reveal:
        typeof approvalThresholds.contact_reveal === "string" && approvalThresholds.contact_reveal.trim()
          ? approvalThresholds.contact_reveal.trim()
          : DEFAULT_CONTACT_REVEAL
    },
    auto_approve: {
      message_types: normalizeStringArray(autoApprove.message_types),
      actions: normalizeStringArray(autoApprove.actions)
    },
    allowlist_agent_ids: normalizeStringArray(source.allowlist_agent_ids),
    denylist_agent_ids: normalizeStringArray(source.denylist_agent_ids)
  };
}

export function createDefaultPolicy({ version = DEFAULT_POLICY_VERSION } = {}) {
  const normalized = normalizePolicyInput(POLICY_SHAPE);
  return {
    ...normalized,
    version
  };
}

export function stripPolicyVersion(policy) {
  if (!isPlainObject(policy)) return {};
  const { version, ...rest } = policy;
  return rest;
}

export function validatePolicyInput(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    errors.push({ field: "policy", message: "policy must be an object" });
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(input, "version")) {
    if (!Number.isInteger(input.version) || input.version < 0) {
      errors.push({ field: "version", message: "version must be a non-negative integer" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "budgets") && !isPlainObject(input.budgets)) {
    errors.push({ field: "budgets", message: "budgets must be an object" });
  }

  if (isPlainObject(input.budgets)) {
    const { max_offer: maxOffer, currency } = input.budgets;
    if (maxOffer !== undefined && maxOffer !== null) {
      if (typeof maxOffer !== "number" || Number.isNaN(maxOffer)) {
        errors.push({ field: "budgets.max_offer", message: "max_offer must be a number" });
      } else if (maxOffer < 0) {
        errors.push({ field: "budgets.max_offer", message: "max_offer must be >= 0" });
      }
      if (currency === undefined || currency === null || currency === "") {
        errors.push({ field: "budgets.currency", message: "currency is required when max_offer is set" });
      }
    }
    if (currency !== undefined && currency !== null && typeof currency !== "string") {
      errors.push({ field: "budgets.currency", message: "currency must be a string" });
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(input, "approval_thresholds") &&
    !isPlainObject(input.approval_thresholds)
  ) {
    errors.push({ field: "approval_thresholds", message: "approval_thresholds must be an object" });
  }

  if (isPlainObject(input.approval_thresholds)) {
    const { offer_amount_gt: offerAmountGt, contact_reveal: contactReveal } = input.approval_thresholds;
    if (offerAmountGt !== undefined && offerAmountGt !== null) {
      if (typeof offerAmountGt !== "number" || Number.isNaN(offerAmountGt)) {
        errors.push({ field: "approval_thresholds.offer_amount_gt", message: "offer_amount_gt must be a number" });
      } else if (offerAmountGt < 0) {
        errors.push({ field: "approval_thresholds.offer_amount_gt", message: "offer_amount_gt must be >= 0" });
      }
    }
    if (contactReveal !== undefined && contactReveal !== null && typeof contactReveal !== "string") {
      errors.push({ field: "approval_thresholds.contact_reveal", message: "contact_reveal must be a string" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "auto_approve") && !isPlainObject(input.auto_approve)) {
    errors.push({ field: "auto_approve", message: "auto_approve must be an object" });
  }

  if (isPlainObject(input.auto_approve)) {
    const { message_types: messageTypes, actions } = input.auto_approve;
    if (messageTypes !== undefined && !Array.isArray(messageTypes)) {
      errors.push({ field: "auto_approve.message_types", message: "message_types must be an array" });
    }
    if (Array.isArray(messageTypes) && messageTypes.some((item) => typeof item !== "string")) {
      errors.push({ field: "auto_approve.message_types", message: "message_types entries must be strings" });
    }
    if (actions !== undefined && !Array.isArray(actions)) {
      errors.push({ field: "auto_approve.actions", message: "actions must be an array" });
    }
    if (Array.isArray(actions) && actions.some((item) => typeof item !== "string")) {
      errors.push({ field: "auto_approve.actions", message: "actions entries must be strings" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "allowlist_agent_ids") && !Array.isArray(input.allowlist_agent_ids)) {
    errors.push({ field: "allowlist_agent_ids", message: "allowlist_agent_ids must be an array" });
  }
  if (
    Array.isArray(input.allowlist_agent_ids) &&
    input.allowlist_agent_ids.some((item) => typeof item !== "string")
  ) {
    errors.push({ field: "allowlist_agent_ids", message: "allowlist_agent_ids entries must be strings" });
  }

  if (Object.prototype.hasOwnProperty.call(input, "denylist_agent_ids") && !Array.isArray(input.denylist_agent_ids)) {
    errors.push({ field: "denylist_agent_ids", message: "denylist_agent_ids must be an array" });
  }
  if (Array.isArray(input.denylist_agent_ids) && input.denylist_agent_ids.some((item) => typeof item !== "string")) {
    errors.push({ field: "denylist_agent_ids", message: "denylist_agent_ids entries must be strings" });
  }

  return errors;
}
