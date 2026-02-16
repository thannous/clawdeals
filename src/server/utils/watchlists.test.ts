import { describe, expect, it } from "vitest";
import { parseWatchlistCriteria } from "./watchlists";

describe("parseWatchlistCriteria", () => {
  it("rejects criteria with only delivery_method", () => {
    expect(() =>
      parseWatchlistCriteria({
        delivery_method: "PICKUP"
      })
    ).toThrow("criteria must include at least one filter");
  });

  it("rejects criteria with only deal_type and country", () => {
    expect(() =>
      parseWatchlistCriteria({
        deal_type: "LOCAL",
        country: "FR"
      })
    ).toThrow("criteria must include at least one filter");
  });

  it("accepts delivery_method when combined with a legacy filter", () => {
    const parsed = parseWatchlistCriteria({
      query: "rtx 4070",
      delivery_method: "shipping"
    });

    expect(parsed.criteria.query).toBe("rtx 4070");
    expect(parsed.criteria.delivery_method).toBe("SHIPPING");
    expect(parsed.queryText).toBe("rtx 4070");
  });
});
