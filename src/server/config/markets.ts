export const LAUNCH_MARKET_CODES = ["FR", "GB", "ES"] as const;

export type LaunchMarketCode = (typeof LAUNCH_MARKET_CODES)[number];

export const MARKET_CURRENCY: Record<LaunchMarketCode, "EUR" | "GBP"> = {
  FR: "EUR",
  GB: "GBP",
  ES: "EUR"
};

const LAUNCH_MARKET_SET = new Set<string>(LAUNCH_MARKET_CODES);

export function normalizeMarketCode(value: unknown): LaunchMarketCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return LAUNCH_MARKET_SET.has(normalized) ? (normalized as LaunchMarketCode) : null;
}

export function resolveMarketCode({
  marketCode,
  currency,
  country
}: {
  marketCode?: unknown;
  currency?: unknown;
  country?: unknown;
}): LaunchMarketCode {
  if (marketCode !== undefined && marketCode !== null && marketCode !== "") {
    const explicit = normalizeMarketCode(marketCode);
    if (!explicit) {
      throw new Error("market_code must be FR, GB, or ES");
    }
    return explicit;
  }

  const countryMarket = normalizeMarketCode(country);
  if (countryMarket) return countryMarket;

  const normalizedCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : null;
  if (normalizedCurrency === "GBP") return "GB";
  if (normalizedCurrency === "EUR") return "FR";

  throw new Error("market_code is required");
}

export function assertNativeMarketCurrency(marketCode: LaunchMarketCode, currency: unknown) {
  const normalizedCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const expectedCurrency = MARKET_CURRENCY[marketCode];
  if (normalizedCurrency !== expectedCurrency) {
    throw new Error(`currency must be ${expectedCurrency} for market ${marketCode}`);
  }
  return expectedCurrency;
}
