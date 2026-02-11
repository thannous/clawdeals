export const ORIGIN_CONTEXT_KIND = {
  CONTROL_DM: "CONTROL_DM",
  PUBLIC_GROUP: "PUBLIC_GROUP",
  NEGOTIATION_THREAD: "NEGOTIATION_THREAD",
  UNKNOWN: "UNKNOWN"
} as const;

export const AUTHORITY_DECISION = {
  EXECUTED: "EXECUTED",
  STAGED: "STAGED",
  BLOCKED: "BLOCKED"
} as const;

const NEGOTIATION_ALLOWED_ACTIONS = new Set(["offer.create", "offer.counter", "offer.accept", "offer.decline"]);

const KIND_ALIASES: Record<string, string> = {
  control_dm: ORIGIN_CONTEXT_KIND.CONTROL_DM,
  controldm: ORIGIN_CONTEXT_KIND.CONTROL_DM,
  dm: ORIGIN_CONTEXT_KIND.CONTROL_DM,
  public_group: ORIGIN_CONTEXT_KIND.PUBLIC_GROUP,
  publicgroup: ORIGIN_CONTEXT_KIND.PUBLIC_GROUP,
  public: ORIGIN_CONTEXT_KIND.PUBLIC_GROUP,
  group: ORIGIN_CONTEXT_KIND.PUBLIC_GROUP,
  negotiation_thread: ORIGIN_CONTEXT_KIND.NEGOTIATION_THREAD,
  negotiationthread: ORIGIN_CONTEXT_KIND.NEGOTIATION_THREAD,
  negotiation: ORIGIN_CONTEXT_KIND.NEGOTIATION_THREAD
};

function normalizeToken(value: any): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function hasExplicitOriginContext(originContext: any): boolean {
  if (originContext && typeof originContext === "object") {
    const kind = originContext.kind || originContext.type || originContext.context;
    return typeof kind === "string" && kind.trim().length > 0;
  }
  return typeof originContext === "string" && originContext.trim().length > 0;
}

function resolveKindFromToken(value: any): string {
  const token = normalizeToken(value);
  if (!token) return ORIGIN_CONTEXT_KIND.UNKNOWN;
  return KIND_ALIASES[token] || ORIGIN_CONTEXT_KIND.UNKNOWN;
}

export function resolveOriginContext({ originContext, fallbackOrigin }: any = {}) {
  const rawKind =
    originContext && typeof originContext === "object"
      ? originContext.kind || originContext.type || originContext.context || null
      : originContext;
  const hasExplicitKind =
    rawKind !== null &&
    rawKind !== undefined &&
    (typeof rawKind !== "string" || rawKind.trim().length > 0);

  const explicitKind = resolveKindFromToken(rawKind);
  if (explicitKind !== ORIGIN_CONTEXT_KIND.UNKNOWN) {
    return {
      kind: explicitKind,
      source: typeof fallbackOrigin === "string" && fallbackOrigin ? fallbackOrigin : null,
      inferred: false
    };
  }
  if (hasExplicitKind) {
    return {
      kind: ORIGIN_CONTEXT_KIND.UNKNOWN,
      source: typeof fallbackOrigin === "string" && fallbackOrigin ? fallbackOrigin : null,
      inferred: false
    };
  }

  const fallback = normalizeToken(fallbackOrigin);
  if (fallback.includes("control_dm")) {
    return { kind: ORIGIN_CONTEXT_KIND.CONTROL_DM, source: fallbackOrigin || null, inferred: true };
  }
  if (fallback.includes("public") || fallback.includes("group")) {
    return { kind: ORIGIN_CONTEXT_KIND.PUBLIC_GROUP, source: fallbackOrigin || null, inferred: true };
  }
  if (fallback.includes("negotiation")) {
    return { kind: ORIGIN_CONTEXT_KIND.NEGOTIATION_THREAD, source: fallbackOrigin || null, inferred: true };
  }

  return {
    kind: ORIGIN_CONTEXT_KIND.UNKNOWN,
    source: fallbackOrigin || null,
    inferred: true
  };
}

export function evaluateAuthorityAction({ actionType, originContext }: any = {}) {
  const action = typeof actionType === "string" ? actionType.trim() : "";
  const kind = resolveOriginContext({ originContext }).kind;

  if (!action) {
    return {
      decision: AUTHORITY_DECISION.BLOCKED,
      reason: "action_type_missing",
      requires_control_dm_confirm: false
    };
  }

  if (kind === ORIGIN_CONTEXT_KIND.CONTROL_DM) {
    return {
      decision: AUTHORITY_DECISION.EXECUTED,
      reason: "control_dm_allowed",
      requires_control_dm_confirm: false
    };
  }

  if (kind === ORIGIN_CONTEXT_KIND.PUBLIC_GROUP) {
    return {
      decision: AUTHORITY_DECISION.STAGED,
      reason: "public_group_requires_control_dm",
      requires_control_dm_confirm: true
    };
  }

  if (kind === ORIGIN_CONTEXT_KIND.NEGOTIATION_THREAD) {
    if (NEGOTIATION_ALLOWED_ACTIONS.has(action)) {
      return {
        decision: AUTHORITY_DECISION.EXECUTED,
        reason: "negotiation_action_allowed",
        requires_control_dm_confirm: false
      };
    }
    return {
      decision: AUTHORITY_DECISION.BLOCKED,
      reason: "negotiation_action_not_allowed",
      requires_control_dm_confirm: false
    };
  }

  return {
    decision: AUTHORITY_DECISION.BLOCKED,
    reason: "origin_context_unknown",
    requires_control_dm_confirm: false
  };
}
