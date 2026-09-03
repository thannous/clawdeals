export type PolicyChip = {
  labelKey: string;
  values?: Record<string, string | number>;
  tone: "neutral" | "ok" | "warn" | "error";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Human label for the receipt `policy.decision`, so nobody has to parse JSON to know what happened. */
export function describePolicyDecision(policy: unknown): PolicyChip {
  const record = isRecord(policy) ? policy : {};
  const decision = typeof record.decision === "string" ? record.decision : "";
  const errorCode = typeof record.error_code === "string" ? record.error_code : null;

  switch (decision) {
    case "read_completed":
      return { labelKey: "activity.policy.read", tone: "neutral" };
    case "allowed":
      return { labelKey: "activity.policy.allowed", tone: "neutral" };
    case "awaiting_human_confirmation":
      return { labelKey: "activity.policy.awaitingConfirmation", tone: "warn" };
    case "human_approved":
      return { labelKey: "activity.policy.humanApproved", tone: "ok" };
    case "server_accepted":
      return { labelKey: "activity.policy.serverAccepted", tone: "ok" };
    case "human_approved_and_server_accepted":
      return { labelKey: "activity.policy.humanAndServerAccepted", tone: "ok" };
    case "human_denied":
      return { labelKey: "activity.policy.humanDenied", tone: "warn" };
    case "server_rejected":
      return {
        labelKey: errorCode === "APPROVAL_REQUIRED" ? "activity.policy.approvalRequired" : "activity.policy.serverRejected",
        values: errorCode ? { errorCode } : undefined,
        tone: errorCode === "APPROVAL_REQUIRED" ? "warn" : "error"
      };
    case "outcome_unknown":
      return { labelKey: "activity.policy.outcomeUnknown", tone: "error" };
    default:
      return decision
        ? { labelKey: "activity.policy.unknown", values: { decision: decision.replace(/_/g, " ") }, tone: "neutral" }
        : { labelKey: "activity.policy.none", tone: "neutral" };
  }
}
