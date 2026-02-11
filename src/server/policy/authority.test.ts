import { describe, expect, it } from "vitest";
import {
  AUTHORITY_DECISION,
  evaluateAuthorityAction,
  hasExplicitOriginContext,
  ORIGIN_CONTEXT_KIND,
  resolveOriginContext
} from "./authority";

describe("resolveOriginContext", () => {
  it("normalizes explicit origin_context values", () => {
    const result = resolveOriginContext({ originContext: { kind: "public_group" } });
    expect(result.kind).toBe(ORIGIN_CONTEXT_KIND.PUBLIC_GROUP);
    expect(result.inferred).toBe(false);
  });

  it("returns UNKNOWN when origin_context is missing", () => {
    const result = resolveOriginContext({});
    expect(result.kind).toBe(ORIGIN_CONTEXT_KIND.UNKNOWN);
    expect(result.inferred).toBe(true);
  });

  it("keeps invalid explicit origin_context as UNKNOWN", () => {
    const result = resolveOriginContext({ originContext: { kind: "totally_invalid" } });
    expect(result.kind).toBe(ORIGIN_CONTEXT_KIND.UNKNOWN);
    expect(result.inferred).toBe(false);
  });
});

describe("hasExplicitOriginContext", () => {
  it("detects explicit object and string origin contexts", () => {
    expect(hasExplicitOriginContext({ kind: "control_dm" })).toBe(true);
    expect(hasExplicitOriginContext("control_dm")).toBe(true);
    expect(hasExplicitOriginContext({ kind: "" })).toBe(false);
    expect(hasExplicitOriginContext(null)).toBe(false);
  });
});

describe("evaluateAuthorityAction", () => {
  it("stages public/group actions for control-dm confirmation", () => {
    const decision = evaluateAuthorityAction({
      actionType: "listing.create",
      originContext: { kind: "public_group" }
    });
    expect(decision.decision).toBe(AUTHORITY_DECISION.STAGED);
    expect(decision.requires_control_dm_confirm).toBe(true);
  });

  it("allows negotiation offer/counter actions", () => {
    const decision = evaluateAuthorityAction({
      actionType: "offer.counter",
      originContext: { kind: "negotiation_thread" }
    });
    expect(decision.decision).toBe(AUTHORITY_DECISION.EXECUTED);
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
