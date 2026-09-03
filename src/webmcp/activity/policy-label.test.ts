import { describe, expect, it } from "vitest";

import { describePolicyDecision } from "./policy-label";

describe("describePolicyDecision", () => {
  it("maps every known decision to a human label and tone", () => {
    expect(describePolicyDecision({ decision: "read_completed" })).toEqual({ label: "Read", tone: "neutral" });
    expect(describePolicyDecision({ decision: "human_approved_and_server_accepted" })).toEqual({
      label: "Approved by you · server accepted",
      tone: "ok"
    });
    expect(describePolicyDecision({ decision: "human_denied" })).toEqual({ label: "Rejected by you", tone: "warn" });
    expect(describePolicyDecision({ decision: "server_rejected", error_code: "APPROVAL_REQUIRED" })).toEqual({
      label: "Policy stop · owner approval required",
      tone: "warn"
    });
    expect(describePolicyDecision({ decision: "server_rejected", error_code: "FORBIDDEN" })).toEqual({
      label: "Server rejected · FORBIDDEN",
      tone: "error"
    });
    expect(describePolicyDecision({ decision: "outcome_unknown" }).tone).toBe("error");
  });

  it("degrades gracefully on unknown or missing policies", () => {
    expect(describePolicyDecision(null)).toEqual({ label: "No policy decision", tone: "neutral" });
    expect(describePolicyDecision({ decision: "something_else" })).toEqual({ label: "something else", tone: "neutral" });
  });
});
