const DEFAULT_CONTACT_REVEAL = "always";
const DEFAULT_POLICY_VERSION = 1;
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "08:00";

export const POLICY_AUTONOMOUS_ACTIONS = ["search", "ask_question", "make_offer"] as const;

const POLICY_SHAPE = {
  budgets: {
    max_offer: null,
    preferred_offer: null,
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
  mission_defaults: {
    radius_km: DEFAULT_RADIUS_KM,
    autonomous_actions: [...POLICY_AUTONOMOUS_ACTIONS]
  },
  quiet_hours: {
    enabled: false,
    start: DEFAULT_QUIET_START,
    end: DEFAULT_QUIET_END,
    timezone: "UTC"
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

function normalizeRadius(value) {
  if (!Number.isInteger(value) || value < 1 || value > 300) return DEFAULT_RADIUS_KM;
  return value;
}

function normalizeTime(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : fallback;
}

function normalizeTimezone(value) {
  if (typeof value !== "string") return "UTC";
  const trimmed = value.trim();
  return trimmed || "UTC";
}

function isValidTimezone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizePolicyInput(input) {
  const source = isPlainObject(input) ? input : {};
  const budgets = isPlainObject(source.budgets) ? source.budgets : {};
  const approvalThresholds = isPlainObject(source.approval_thresholds) ? source.approval_thresholds : {};
  const autoApprove = isPlainObject(source.auto_approve) ? source.auto_approve : {};
  const missionDefaults = isPlainObject(source.mission_defaults)
    ? source.mission_defaults
    : POLICY_SHAPE.mission_defaults;
  const quietHours = isPlainObject(source.quiet_hours) ? source.quiet_hours : {};
  const autonomousActions = normalizeStringArray(missionDefaults.autonomous_actions).filter((action) =>
    POLICY_AUTONOMOUS_ACTIONS.includes(action as (typeof POLICY_AUTONOMOUS_ACTIONS)[number])
  );
  if (!autonomousActions.includes("search")) autonomousActions.unshift("search");

  return {
    budgets: {
      max_offer: normalizeNumber(budgets.max_offer),
      preferred_offer: normalizeNumber(budgets.preferred_offer),
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
    mission_defaults: {
      radius_km: normalizeRadius(missionDefaults.radius_km),
      autonomous_actions: autonomousActions
    },
    quiet_hours: {
      enabled: quietHours.enabled === true,
      start: normalizeTime(quietHours.start, DEFAULT_QUIET_START),
      end: normalizeTime(quietHours.end, DEFAULT_QUIET_END),
      timezone: normalizeTimezone(quietHours.timezone)
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
      errors.push({
        field: "version",
        message: "version must be a non-negative integer"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "budgets") && !isPlainObject(input.budgets)) {
    errors.push({ field: "budgets", message: "budgets must be an object" });
  }

  if (isPlainObject(input.budgets)) {
    const { max_offer: maxOffer, preferred_offer: preferredOffer, currency } = input.budgets;
    if (maxOffer !== undefined && maxOffer !== null) {
      if (typeof maxOffer !== "number" || Number.isNaN(maxOffer)) {
        errors.push({
          field: "budgets.max_offer",
          message: "max_offer must be a number"
        });
      } else if (maxOffer < 0) {
        errors.push({
          field: "budgets.max_offer",
          message: "max_offer must be >= 0"
        });
      }
      if (currency === undefined || currency === null || currency === "") {
        errors.push({
          field: "budgets.currency",
          message: "currency is required when max_offer is set"
        });
      }
    }
    if (currency !== undefined && currency !== null && typeof currency !== "string") {
      errors.push({
        field: "budgets.currency",
        message: "currency must be a string"
      });
    }
    if (preferredOffer !== undefined && preferredOffer !== null) {
      if (typeof preferredOffer !== "number" || Number.isNaN(preferredOffer)) {
        errors.push({
          field: "budgets.preferred_offer",
          message: "preferred_offer must be a number"
        });
      } else if (preferredOffer < 0) {
        errors.push({
          field: "budgets.preferred_offer",
          message: "preferred_offer must be >= 0"
        });
      }
      if (currency === undefined || currency === null || currency === "") {
        errors.push({
          field: "budgets.currency",
          message: "currency is required when preferred_offer is set"
        });
      }
    }
    if (typeof preferredOffer === "number" && typeof maxOffer === "number" && preferredOffer > maxOffer) {
      errors.push({
        field: "budgets.preferred_offer",
        message: "preferred_offer must be <= max_offer"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "approval_thresholds") && !isPlainObject(input.approval_thresholds)) {
    errors.push({
      field: "approval_thresholds",
      message: "approval_thresholds must be an object"
    });
  }

  if (isPlainObject(input.approval_thresholds)) {
    const { offer_amount_gt: offerAmountGt, contact_reveal: contactReveal } = input.approval_thresholds;
    if (offerAmountGt !== undefined && offerAmountGt !== null) {
      if (typeof offerAmountGt !== "number" || Number.isNaN(offerAmountGt)) {
        errors.push({
          field: "approval_thresholds.offer_amount_gt",
          message: "offer_amount_gt must be a number"
        });
      } else if (offerAmountGt < 0) {
        errors.push({
          field: "approval_thresholds.offer_amount_gt",
          message: "offer_amount_gt must be >= 0"
        });
      }
    }
    if (contactReveal !== undefined && contactReveal !== null && typeof contactReveal !== "string") {
      errors.push({
        field: "approval_thresholds.contact_reveal",
        message: "contact_reveal must be a string"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "auto_approve") && !isPlainObject(input.auto_approve)) {
    errors.push({
      field: "auto_approve",
      message: "auto_approve must be an object"
    });
  }

  if (isPlainObject(input.auto_approve)) {
    const { message_types: messageTypes, actions } = input.auto_approve;
    if (messageTypes !== undefined && !Array.isArray(messageTypes)) {
      errors.push({
        field: "auto_approve.message_types",
        message: "message_types must be an array"
      });
    }
    if (Array.isArray(messageTypes) && messageTypes.some((item) => typeof item !== "string")) {
      errors.push({
        field: "auto_approve.message_types",
        message: "message_types entries must be strings"
      });
    }
    if (actions !== undefined && !Array.isArray(actions)) {
      errors.push({
        field: "auto_approve.actions",
        message: "actions must be an array"
      });
    }
    if (Array.isArray(actions) && actions.some((item) => typeof item !== "string")) {
      errors.push({
        field: "auto_approve.actions",
        message: "actions entries must be strings"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "mission_defaults") && !isPlainObject(input.mission_defaults)) {
    errors.push({
      field: "mission_defaults",
      message: "mission_defaults must be an object"
    });
  }

  if (isPlainObject(input.mission_defaults)) {
    const { radius_km: radiusKm, autonomous_actions: autonomousActions } = input.mission_defaults;
    if (radiusKm !== undefined && (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > 300)) {
      errors.push({
        field: "mission_defaults.radius_km",
        message: "radius_km must be an integer between 1 and 300"
      });
    }
    if (autonomousActions !== undefined && !Array.isArray(autonomousActions)) {
      errors.push({
        field: "mission_defaults.autonomous_actions",
        message: "autonomous_actions must be an array"
      });
    }
    if (
      Array.isArray(autonomousActions) &&
      autonomousActions.some(
        (action) =>
          typeof action !== "string" ||
          !POLICY_AUTONOMOUS_ACTIONS.includes(action as (typeof POLICY_AUTONOMOUS_ACTIONS)[number])
      )
    ) {
      errors.push({
        field: "mission_defaults.autonomous_actions",
        message: `autonomous_actions entries must be one of: ${POLICY_AUTONOMOUS_ACTIONS.join(", ")}`
      });
    }
    if (Array.isArray(autonomousActions) && !autonomousActions.includes("search")) {
      errors.push({
        field: "mission_defaults.autonomous_actions",
        message: "search is required"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "quiet_hours") && !isPlainObject(input.quiet_hours)) {
    errors.push({
      field: "quiet_hours",
      message: "quiet_hours must be an object"
    });
  }

  if (isPlainObject(input.quiet_hours)) {
    const { enabled, start, end, timezone } = input.quiet_hours;
    if (enabled !== undefined && typeof enabled !== "boolean") {
      errors.push({
        field: "quiet_hours.enabled",
        message: "enabled must be a boolean"
      });
    }
    if (start !== undefined && (typeof start !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start))) {
      errors.push({
        field: "quiet_hours.start",
        message: "start must use HH:mm"
      });
    }
    if (end !== undefined && (typeof end !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end))) {
      errors.push({ field: "quiet_hours.end", message: "end must use HH:mm" });
    }
    if (timezone !== undefined && !isValidTimezone(timezone)) {
      errors.push({
        field: "quiet_hours.timezone",
        message: "timezone must be a valid IANA timezone"
      });
    }
    if (enabled === true && (start === undefined || end === undefined)) {
      errors.push({
        field: "quiet_hours",
        message: "start and end are required when quiet hours are enabled"
      });
    }
    if (enabled === true && typeof start === "string" && typeof end === "string" && start === end) {
      errors.push({
        field: "quiet_hours",
        message: "start and end must differ when quiet hours are enabled"
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "allowlist_agent_ids") && !Array.isArray(input.allowlist_agent_ids)) {
    errors.push({
      field: "allowlist_agent_ids",
      message: "allowlist_agent_ids must be an array"
    });
  }
  if (Array.isArray(input.allowlist_agent_ids) && input.allowlist_agent_ids.some((item) => typeof item !== "string")) {
    errors.push({
      field: "allowlist_agent_ids",
      message: "allowlist_agent_ids entries must be strings"
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, "denylist_agent_ids") && !Array.isArray(input.denylist_agent_ids)) {
    errors.push({
      field: "denylist_agent_ids",
      message: "denylist_agent_ids must be an array"
    });
  }
  if (Array.isArray(input.denylist_agent_ids) && input.denylist_agent_ids.some((item) => typeof item !== "string")) {
    errors.push({
      field: "denylist_agent_ids",
      message: "denylist_agent_ids entries must be strings"
    });
  }

  return errors;
}
