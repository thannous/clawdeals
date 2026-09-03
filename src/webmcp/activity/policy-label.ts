export type PolicyChip = {
  label: string;
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
      return { label: "Read", tone: "neutral" };
    case "allowed":
      return { label: "Allowed", tone: "neutral" };
    case "awaiting_human_confirmation":
      return { label: "Awaiting your confirmation", tone: "warn" };
    case "human_approved":
      return { label: "Approved by you · executing", tone: "ok" };
    case "server_accepted":
      return { label: "Server accepted", tone: "ok" };
    case "human_approved_and_server_accepted":
      return { label: "Approved by you · server accepted", tone: "ok" };
    case "human_denied":
      return { label: "Rejected by you", tone: "warn" };
    case "server_rejected":
      return {
        label: errorCode === "APPROVAL_REQUIRED" ? "Policy stop · owner approval required" : `Server rejected${errorCode ? ` · ${errorCode}` : ""}`,
        tone: errorCode === "APPROVAL_REQUIRED" ? "warn" : "error"
      };
    case "outcome_unknown":
      return { label: "Outcome unknown · reconcile before retrying", tone: "error" };
    default:
      return { label: decision ? decision.replace(/_/g, " ") : "No policy decision", tone: "neutral" };
  }
}
