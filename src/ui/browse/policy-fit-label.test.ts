import { describe, expect, it } from "vitest";

import { describePolicyFit } from "./policy-fit-label";

describe("describePolicyFit", () => {
  it("rejects on the hard budget even when soft issues are present", () => {
    expect(describePolicyFit({ eligible: false, issues: ["over_hard_budget", "requirements_unverified"] })).toEqual({
      labelKey: "policyFit.issues.overHardBudget",
      tone: "reject",
      details: [{ key: "policyFit.issues.overHardBudget" }, { key: "policyFit.issues.requirementsUnverified" }]
    });
  });

  it("warns above the preferred price while staying eligible", () => {
    expect(describePolicyFit({ eligible: true, issues: ["over_preferred_price", "requirements_unverified"] })).toMatchObject({
      labelKey: "policyFit.abovePreferredPrice",
      tone: "warn"
    });
  });

  it("marks a fit that still needs seller confirmation", () => {
    expect(describePolicyFit({ eligible: true, issues: ["requirements_unverified"] })).toMatchObject({
      labelKey: "policyFit.fitsConfirm",
      tone: "fit"
    });
  });

  it("marks a clean fit and humanizes unknown issues", () => {
    expect(describePolicyFit({ eligible: true, issues: [] })).toMatchObject({ labelKey: "policyFit.fits", tone: "fit" });
    expect(describePolicyFit({ eligible: false, issues: ["seller_blocked"] })).toMatchObject({
      labelKey: "policyFit.issues.unknown",
      labelValues: { issue: "Seller blocked" },
      tone: "reject"
    });
    expect(describePolicyFit({ eligible: false, issues: [] })).toMatchObject({ labelKey: "policyFit.outsideMission", tone: "reject" });
  });
});
