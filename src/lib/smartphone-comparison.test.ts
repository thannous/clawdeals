import { describe, expect, it } from "vitest";
import { deriveComparison, parseComparisonIds, type ComparisonItem } from "./smartphone-comparison";
import { SMARTPHONE_CHECK_IDS, type SmartphonePassport } from "./smartphone-passport";

const IDS = ["abcdef12-abcd-4abc-8abc-abcdef123456", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
function item(index: number, amount: number, health = 90): ComparisonItem {
  const id = IDS[index];
  const passport: SmartphonePassport = {
    listing_id: id, revision: 1, model: "Phone", battery_health_percent: health, updated_at: "2026-10-22T17:00:00Z", questions: [],
    checks: SMARTPHONE_CHECK_IDS.map((checkId) => ({ id: checkId, answer: "ok", notes: "", status: "declared", photos: [] }))
  };
  return { listing_id: id, availability: "available", listing: { listing_id: id, title: "Phone", condition: "GOOD", price: { amount, currency: "EUR" }, market_code: "FR" }, passport, passport_error: false };
}
// Counterexamples complement the browser journey with malformed values, exact
// currency boundaries, ties and photo changes that must never alter ranking.
describe("declared smartphone metric comparison", () => {
  it("compares price without a passport while keeping its unknown facts null", () => {
    const items = [item(0, 20000), item(1, 30000)];
    items[0].passport = null;
    items[1].passport_error = true;
    const result = deriveComparison(items, "budget");
    expect(result.status).toBe("ranked");
    expect(result.winnerIds).toEqual([IDS[0]]);
    expect(result.facts[0]).toMatchObject({ price_amount: 20000, battery_health_percent: null, issue_count: null, known_check_count: null, declared_count: null, documented_count: null });
    expect(result.facts[1].battery_health_percent).toBeNull();
  });
  it("retains all tied lowest prices instead of choosing the first", () => {
    expect(deriveComparison([item(0, 25000), item(1, 25000), item(2, 26000)], "budget")).toMatchObject({ status: "tie", winnerIds: [IDS[0], IDS[1]] });
  });
  it.each([null, undefined, "100", NaN, -1, Infinity])("never replaces invalid price %s with zero", (price) => {
    const items = [item(0, 10000), item(1, 20000)];
    items[0].listing!.price.amount = price as number;
    expect(deriveComparison(items, "budget")).toMatchObject({ status: "incomplete", winnerIds: [], blockedIds: [IDS[0]] });
  });
  it.each(["budget", "battery", "condition"] as const)("does not rank %s across currencies", (priority) => {
    const items = [item(0, 10000), item(1, 20000)];
    items[1].listing!.price.currency = "USD";
    expect(deriveComparison(items, priority)).toMatchObject({ status: "different_currencies", winnerIds: [] });
  });
  it("uses known battery health only, never inferred autonomy or unknown percentages", () => {
    const items = [item(0, 10000, 89), item(1, 20000, 92)];
    expect(deriveComparison(items, "battery").winnerIds).toEqual([IDS[1]]);
    items[1].passport!.checks[0].answer = "unknown";
    expect(deriveComparison(items, "battery")).toMatchObject({ status: "incomplete", winnerIds: [], blockedIds: [IDS[1]] });
    expect(deriveComparison(items, "battery").facts[1].battery_health_percent).toBeNull();
  });
  it("distinguishes a reported zero battery health from absent data", () => {
    const items = [item(0, 10000, 0), item(1, 20000, 1)];
    expect(deriveComparison(items, "battery")).toMatchObject({ status: "ranked", winnerIds: [IDS[1]] });
    items[0].passport!.battery_health_percent = null;
    expect(deriveComparison(items, "battery")).toMatchObject({ status: "incomplete", winnerIds: [] });
  });
  it("only compares issue counts when every check is known, allowing unavailable battery health", () => {
    const items = [item(0, 10000), item(1, 20000)];
    items[0].passport!.checks[0] = { id: "battery", answer: "not_applicable", notes: "OS does not expose health", status: "declared", photos: [] };
    items[0].passport!.battery_health_percent = null;
    items[1].passport!.checks[1].answer = "issue";
    items[1].passport!.checks[1].notes = "Crack";
    expect(deriveComparison(items, "condition")).toMatchObject({ status: "ranked", winnerIds: [IDS[0]] });
    items[0].passport!.checks[4].answer = "unknown";
    const missing = deriveComparison(items, "condition");
    expect(missing).toMatchObject({ status: "incomplete", winnerIds: [] });
    expect(missing.facts[0].issue_count).toBeNull();
    expect(missing.facts[0].known_check_count).toBe(4);
  });
  it.each(["battery", "condition"] as const)("blocks %s when the passport failed to load", (priority) => {
    const items = [item(0, 10000), item(1, 20000)];
    items[0].passport_error = true;
    expect(deriveComparison(items, priority)).toMatchObject({ status: "incomplete", winnerIds: [], blockedIds: [IDS[0]] });
  });
  it("does not use photos or declared listing condition as a quality score or tie breaker", () => {
    const items = [item(0, 10000), item(1, 10000)];
    items[1].listing!.condition = "NEW";
    items[1].passport!.checks[0].status = "documented";
    items[1].passport!.checks[0].photos = [{ photo_id: IDS[2], url: "/photo", created_at: "2026-10-22T17:00:00Z" }];
    for (const priority of ["budget", "battery", "condition"] as const) {
      const result = deriveComparison(items, priority);
      expect(result).toMatchObject({ status: "tie", winnerIds: [IDS[0], IDS[1]] });
      expect(result.facts[1]).toMatchObject({ documented_count: 1, declared_count: 4 });
    }
  });
  it.each(["unavailable", "error", "unsupported"] as const)("does not rank a selection containing an %s item", (availability) => {
    const items = [item(0, 10000), { ...item(1, 20000), availability, listing: null, passport: null }];
    expect(deriveComparison(items, "budget")).toMatchObject({ status: "unavailable", winnerIds: [], blockedIds: [IDS[1]] });
  });
  it("refuses incomplete/duplicate check sets rather than turning them into zero defects", () => {
    const items = [item(0, 10000), item(1, 20000)];
    items[0].passport!.checks[4] = items[0].passport!.checks[0];
    expect(deriveComparison(items, "condition")).toMatchObject({ status: "incomplete", winnerIds: [] });
    items[0].passport!.checks.pop();
    expect(deriveComparison(items, "condition").facts[0].issue_count).toBeNull();
  });
  it("requires two distinct phones for comparison", () => {
    expect(deriveComparison([item(0, 10000)], "budget").status).toBe("needs_selection");
    expect(deriveComparison([item(0, 10000), item(0, 10000)], "budget").status).toBe("needs_selection");
  });
});

describe("comparison selection parsing", () => {
  it("canonicalizes UUIDs and keeps selection order", () => {
    expect(parseComparisonIds(`${IDS[1]},${IDS[0].toUpperCase()},${IDS[2]}`)).toEqual([IDS[1], IDS[0], IDS[2]]);
  });
  it.each([undefined, [], [IDS[0]], "", "not-a-uuid", `${IDS[0]},`, `${IDS[0]},${IDS[0].toUpperCase()}`, IDS.concat(IDS[0]).join(",")])("rejects invalid/bulk/duplicate input %s", (value) => {
    expect(() => parseComparisonIds(value)).toThrow("one to three unique");
  });
});
