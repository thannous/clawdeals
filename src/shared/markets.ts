export const LAUNCH_MARKETS = [
  { code: "FR", currency: "EUR" },
  { code: "GB", currency: "GBP" },
  { code: "ES", currency: "EUR" }
] as const;

export type LaunchMarketCode = (typeof LAUNCH_MARKETS)[number]["code"];
export type LaunchMarketCurrency = (typeof LAUNCH_MARKETS)[number]["currency"];

export const LAUNCH_MARKET_CODES = LAUNCH_MARKETS.map(({ code }) => code) as [
  LaunchMarketCode,
  ...LaunchMarketCode[]
];

export const MARKET_CURRENCY = Object.fromEntries(
  LAUNCH_MARKETS.map(({ code, currency }) => [code, currency])
) as Record<LaunchMarketCode, LaunchMarketCurrency>;

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
      throw new Error(`market_code must be ${LAUNCH_MARKET_CODES.join(", ").replace(/, ([^,]+)$/, ", or $1")}`);
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
