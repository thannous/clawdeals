import { describe, expect, it } from "vitest";
import { matchesSmartphoneMissionQuery } from "./smartphone-mission-query";

// Counterexamples for the previous ASCII tokenizer: non-ASCII queries cannot
// become empty filters, and the declared model must work with a generic title.
describe("smartphone mission lexical query", () => {
  it("never turns an accented query into an unrestricted match", () => {
    expect(matchesSmartphoneMissionQuery("été", { title: "Random phone" })).toBe(false);
    expect(matchesSmartphoneMissionQuery("ÉTÉ", { title: "Offre été" })).toBe(true);
  });
  it("uses the passport model and every query term", () => {
    expect(matchesSmartphoneMissionQuery("iPhone 13", { title: "My device" }, "iPhone 13 Pro")).toBe(true);
    expect(matchesSmartphoneMissionQuery("iPhone 14", { title: "My device" }, "iPhone 13 Pro")).toBe(false);
  });
  it("normalizes Unicode composition and width while preserving word boundaries", () => {
    expect(matchesSmartphoneMissionQuery("ＩＰＨＯＮＥ café", { title: "iPhone", description: "cafe\u0301" })).toBe(true);
    expect(matchesSmartphoneMissionQuery("phone", { title: "smartphone" })).toBe(false);
    expect(matchesSmartphoneMissionQuery("手机", { title: "手机" })).toBe(true);
  });
  it.each(["", "  ", "!!!", "📱", null])("rejects a query without letters or numbers: %s", query => {
    expect(matchesSmartphoneMissionQuery(query, { title: "iPhone" }, "iPhone 13")).toBe(false);
  });
});
