import { describe, expect, it } from "vitest";

import { describePolicyFit } from "./policy-fit-label";

describe("describePolicyFit", () => {
  it("rejects on the hard budget even when soft issues are present", () => {
    expect(describePolicyFit({ eligible: false, issues: ["over_hard_budget", "requirements_unverified"] })).toEqual({
      label: "Over hard budget",
      tone: "reject",
      details: ["Over hard budget", "Requirements to confirm"]
    });
  });

  it("warns above the preferred price while staying eligible", () => {
    expect(describePolicyFit({ eligible: true, issues: ["over_preferred_price", "requirements_unverified"] })).toMatchObject({
      label: "Above preferred price",
      tone: "warn"
    });
  });

  it("marks a fit that still needs seller confirmation", () => {
    expect(describePolicyFit({ eligible: true, issues: ["requirements_unverified"] })).toMatchObject({
      label: "Fits · confirm requirements",
      tone: "fit"
    });
  });

  it("marks a clean fit and humanizes unknown issues", () => {
    expect(describePolicyFit({ eligible: true, issues: [] })).toMatchObject({ label: "Fits mission", tone: "fit" });
    expect(describePolicyFit({ eligible: false, issues: ["seller_blocked"] })).toMatchObject({ label: "Seller blocked", tone: "reject" });
    expect(describePolicyFit({ eligible: false, issues: [] })).toMatchObject({ label: "Outside mission", tone: "reject" });
  });
});
