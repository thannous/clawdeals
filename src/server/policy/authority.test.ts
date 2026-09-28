import { describe, expect, it } from "vitest";
import {
  AUTHORITY_DECISION,
  evaluateAuthorityAction} from "./authority";

describe("evaluateAuthorityAction", () => {
  it("stages public/group actions for control-dm confirmation", () => {
    const decision = evaluateAuthorityAction({
      actionType: "listing.create",
      originContext: { kind: "public_group" }
    });
    expect(decision.decision).toBe(AUTHORITY_DECISION.STAGED);
    expect(decision.requires_control_dm_confirm).toBe(true);
  });

  it("blocks non-negotiation actions inside negotiation context", () => {
    const decision = evaluateAuthorityAction({
      actionType: "watchlist.create",
      originContext: { kind: "negotiation_thread" }
    });
    expect(decision.decision).toBe(AUTHORITY_DECISION.BLOCKED);
    expect(decision.reason).toBe("negotiation_action_not_allowed");
  });
});
