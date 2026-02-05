import { describe, expect, it } from "vitest";
import { evaluatePolicyAction, POLICY_DECISION } from "./evaluate";

const basePolicy = {
  version: 2,
  budgets: { max_offer: 400, currency: "EUR" },
  approval_thresholds: { offer_amount_gt: 450, contact_reveal: "always" },
  auto_approve: { message_types: ["answer"], actions: ["listing.create"] },
  allowlist_agent_ids: [],
  denylist_agent_ids: []
};

describe("evaluatePolicyAction", () => {
  it("requires approval when offer exceeds limit", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "offer.create",
      offerAmount: 500,
      offerCurrency: "EUR"
    });
    expect(decision.decision).toBe(POLICY_DECISION.REQUIRES_APPROVAL);
    expect(decision.reason).toBe("offer_above_limit");
    expect(decision.policy_version).toBe(2);
  });

  it("auto-approves offer under limit", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "offer.create",
      offerAmount: 350,
      offerCurrency: "EUR"
    });
    expect(decision.decision).toBe(POLICY_DECISION.AUTO_APPROVED);
    expect(decision.reason).toBe("offer_within_limit");
  });

  it("requires approval on currency mismatch", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "offer.create",
      offerAmount: 200,
      offerCurrency: "USD"
    });
    expect(decision.decision).toBe(POLICY_DECISION.REQUIRES_APPROVAL);
    expect(decision.reason).toBe("currency_mismatch");
  });

  it("auto-approves allowlisted message types", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "message.send",
      messageType: "answer"
    });
    expect(decision.decision).toBe(POLICY_DECISION.AUTO_APPROVED);
    expect(decision.reason).toBe("message_type_allowlisted");
  });

  it("requires approval for non-allowlisted actions", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "thread.create"
    });
    expect(decision.decision).toBe(POLICY_DECISION.REQUIRES_APPROVAL);
    expect(decision.reason).toBe("action_not_allowlisted");
  });

  it("auto-approves allowlisted actions", () => {
    const decision = evaluatePolicyAction({
      policy: basePolicy,
      action: "listing.create"
    });
    expect(decision.decision).toBe(POLICY_DECISION.AUTO_APPROVED);
    expect(decision.reason).toBe("action_allowlisted");
  });

  it("requires approval for contact reveal by default", () => {
    const decision = evaluatePolicyAction({ action: "contact_reveal" });
    expect(decision.decision).toBe(POLICY_DECISION.REQUIRES_APPROVAL);
    expect(decision.reason).toBe("contact_reveal_requires_approval");
  });
});
