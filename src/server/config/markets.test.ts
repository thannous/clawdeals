import { describe, expect, it } from "vitest";

import { assertNativeMarketCurrency, MARKET_CURRENCY, resolveMarketCode } from "./markets";

describe("launch markets", () => {
  it("maps FR, GB, and ES to their native currencies", () => {
    expect(MARKET_CURRENCY).toEqual({ FR: "EUR", GB: "GBP", ES: "EUR" });
  });

  it("keeps locale-independent explicit market selection", () => {
    expect(resolveMarketCode({ marketCode: "es", currency: "EUR" })).toBe("ES");
    expect(resolveMarketCode({ marketCode: "GB", currency: "GBP" })).toBe("GB");
  });

  it("infers only backwards-compatible unambiguous markets", () => {
    expect(resolveMarketCode({ currency: "GBP" })).toBe("GB");
    expect(resolveMarketCode({ currency: "EUR" })).toBe("FR");
    expect(resolveMarketCode({ country: "ES", currency: "EUR" })).toBe("ES");
  });

  it("rejects unsupported markets and non-native currencies", () => {
    expect(() => resolveMarketCode({ marketCode: "US", currency: "USD" })).toThrow("FR, GB, or ES");
    expect(() => assertNativeMarketCurrency("GB", "EUR")).toThrow("GBP");
    expect(() => assertNativeMarketCurrency("ES", "GBP")).toThrow("EUR");
  });
});
