import { describe, expect, it } from "vitest";

import { assertNativeMarketCurrency, resolveMarketCode } from "./markets";

describe("launch markets", () => {

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
