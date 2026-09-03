import { describe, expect, it } from "vitest";

import { describePolicyDecision } from "./policy-label";

describe("describePolicyDecision", () => {
  it("maps every known decision to a human label and tone", () => {
    expect(describePolicyDecision({ decision: "read_completed" })).toEqual({ labelKey: "activity.policy.read", tone: "neutral" });
    expect(describePolicyDecision({ decision: "human_approved_and_server_accepted" })).toEqual({
      labelKey: "activity.policy.humanAndServerAccepted",
      tone: "ok"
    });
    expect(describePolicyDecision({ decision: "human_denied" })).toEqual({ labelKey: "activity.policy.humanDenied", tone: "warn" });
    expect(describePolicyDecision({ decision: "server_rejected", error_code: "APPROVAL_REQUIRED" })).toEqual({
      labelKey: "activity.policy.approvalRequired",
      values: { errorCode: "APPROVAL_REQUIRED" },
      tone: "warn"
    });
    expect(describePolicyDecision({ decision: "server_rejected", error_code: "FORBIDDEN" })).toEqual({
      labelKey: "activity.policy.serverRejected",
      values: { errorCode: "FORBIDDEN" },
      tone: "error"
    });
    expect(describePolicyDecision({ decision: "outcome_unknown" }).tone).toBe("error");
  });

  it("degrades gracefully on unknown or missing policies", () => {
    expect(describePolicyDecision(null)).toEqual({ labelKey: "activity.policy.none", tone: "neutral" });
    expect(describePolicyDecision({ decision: "something_else" })).toEqual({
      labelKey: "activity.policy.unknown",
      values: { decision: "something else" },
      tone: "neutral"
    });
  });
});
