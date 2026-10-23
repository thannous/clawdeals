import { describe, expect, it } from "vitest";
import { SMARTPHONE_CHECK_IDS } from "./smartphone-passport";
import { evaluateSmartphoneMission, normalizeSmartphoneMissionCriteria, type SmartphoneMissionPassport } from "./smartphone-mission";

const criteria = normalizeSmartphoneMissionCriteria({
  version: 1, model: "iPhone 14", battery_health_min: 90, required_checks: ["screen", "functionality"]
});
function passport(): SmartphoneMissionPassport {
  return { model: "iPhone 14", battery_health_percent: 92, checks: SMARTPHONE_CHECK_IDS.map(id => ({ id, answer: "ok" })) };
}

// These counterexamples complement browser journeys: a tempting substring,
// contradictory facts, duplicate checks and zero values must not weaken a brief.
describe("smartphone mission criteria boundaries", () => {
  it.each([
    { version: 1, battery_health_min: null, required_checks: [] },
    { version: 2, model: "iPhone" },
    { version: 1, battery_health_min: "90" },
    { version: 1, battery_health_min: 101 },
    { version: 1, battery_health_min: -1 },
    { version: 1, battery_health_min: 90.5 },
    { version: 1, model: "iPhone", allow_unknown: true },
    { version: 1, model: "iPhone", required_checks: ["screen", "screen"] },
    { version: 1, required_checks: ["seller_verified"] },
    { version: 1, model: "iPhone\n14" }
  ])("rejects an invalid or silently weakened criterion: %j", raw => {
    expect(() => normalizeSmartphoneMissionCriteria(raw)).toThrow();
  });
  it("retains a deliberate zero threshold and canonicalizes check order", () => {
    expect(normalizeSmartphoneMissionCriteria({ version: 1, battery_health_min: 0, required_checks: ["locks", "battery"] }))
      .toEqual({ version: 1, model: null, battery_health_min: 0, required_checks: ["battery", "locks"] });
  });
  it("matches normalized exact models without treating Pro as the same model", () => {
    const value = passport();
    value.model = "  IPHONE   14  ";
    expect(evaluateSmartphoneMission(criteria, value).status).toBe("compatible");
    value.model = "iPhone 14 Pro";
    expect(evaluateSmartphoneMission(criteria, value)).toMatchObject({
      status: "incompatible", reasons: expect.arrayContaining([{ code: "model_mismatch", expected: "iPhone 14", actual: "iPhone 14 Pro" }])
    });
  });
  it("never accepts a missing passport", () => {
    expect(evaluateSmartphoneMission(criteria, null)).toEqual({ status: "unknown", reasons: [{ code: "passport_missing" }] });
  });
  it("does not accept a percentage attached to an unknown or N/A battery answer", () => {
    for (const answer of ["unknown", "not_applicable"] as const) {
      const value = passport();
      value.checks[0].answer = answer;
      expect(evaluateSmartphoneMission(criteria, value).status).toBe("unknown");
    }
  });
  it("does not convert absent health to zero, even when zero is the minimum", () => {
    const zero = normalizeSmartphoneMissionCriteria({ version: 1, battery_health_min: 0 });
    const value = passport();
    value.battery_health_percent = null;
    expect(evaluateSmartphoneMission(zero, value).status).toBe("unknown");
    value.battery_health_percent = 0;
    expect(evaluateSmartphoneMission(zero, value).status).toBe("compatible");
  });
  it("uses a known mismatch even when other information is absent", () => {
    const value = passport();
    value.battery_health_percent = null;
    value.checks.find(check => check.id === "screen")!.answer = "issue";
    expect(evaluateSmartphoneMission(criteria, value)).toMatchObject({
      status: "incompatible", reasons: expect.arrayContaining([
        { code: "battery_unknown", expected: 90 },
        { code: "check_issue", check_id: "screen", expected: "ok", actual: "issue" }
      ])
    });
  });
  it("does not pick a favorable answer from conflicting duplicate checks", () => {
    const value = passport();
    value.checks.push({ id: "screen", answer: "issue" });
    expect(evaluateSmartphoneMission(criteria, value).status).toBe("unknown");
  });
  it("distinguishes percentage eligibility from a battery declared without problems", () => {
    const value = passport();
    value.checks[0].answer = "issue";
    expect(evaluateSmartphoneMission(criteria, value).status).toBe("compatible");
    expect(evaluateSmartphoneMission({ ...criteria, required_checks: ["battery"] }, value).status).toBe("incompatible");
  });
});
