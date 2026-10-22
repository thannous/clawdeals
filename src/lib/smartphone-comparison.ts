import { SMARTPHONE_CHECK_IDS, type SmartphonePassport, type SmartphonePassportCheck } from "./smartphone-passport";

export const MAX_SMARTPHONE_COMPARISON_ITEMS = 3;
export type ComparisonPriority = "budget" | "battery" | "condition";
export type ComparisonListing = {
  listing_id: string;
  title: string;
  condition: string;
  price: { amount: number; currency: string };
  market_code: string | null;
};
export type ComparisonItem = {
  listing_id: string;
  availability: "available" | "unavailable" | "error" | "unsupported";
  listing: ComparisonListing | null;
  passport: SmartphonePassport | null;
  passport_error: boolean;
};
export type ComparisonFact = {
  listing_id: string;
  price_amount: number | null;
  currency: string | null;
  battery_health_percent: number | null;
  issue_count: number | null;
  known_check_count: number | null;
  declared_count: number | null;
  documented_count: number | null;
};
export type ComparisonResult = {
  priority: ComparisonPriority;
  status: "ranked" | "tie" | "needs_selection" | "unavailable" | "incomplete" | "different_currencies";
  winnerIds: string[];
  facts: ComparisonFact[];
  blockedIds: string[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseComparisonIds(raw: unknown): string[] {
  const invalid = () => { throw Object.assign(new Error("Provide one to three unique listing UUIDs in ids, separated by commas."), { status: 400, code: "VALIDATION_ERROR" }); };
  if (typeof raw !== "string" || raw.length > MAX_SMARTPHONE_COMPARISON_ITEMS * 38) return invalid();
  const ids = raw.split(",").map((value) => value.trim().toLowerCase());
  if (!ids.length || ids.length > MAX_SMARTPHONE_COMPARISON_ITEMS || ids.some((id) => !UUID.test(id)) || new Set(ids).size !== ids.length) return invalid();
  return ids;
}

function known(check: SmartphonePassportCheck) {
  return check.answer === "ok" || check.answer === "issue" || (check.id === "battery" && check.answer === "not_applicable" && Boolean(check.notes.trim()));
}

function validChecks(item: ComparisonItem): SmartphonePassportCheck[] | null {
  if (item.passport_error || !item.passport || item.passport.listing_id !== item.listing_id) return null;
  const checks = item.passport.checks;
  if (!Array.isArray(checks) || checks.length !== SMARTPHONE_CHECK_IDS.length || new Set(checks.map((check) => check?.id)).size !== SMARTPHONE_CHECK_IDS.length) return null;
  if (checks.some((check) => !check || !SMARTPHONE_CHECK_IDS.includes(check.id) || !["unknown", "ok", "issue", "not_applicable"].includes(check.answer) || typeof check.notes !== "string" || !Array.isArray(check.photos) || (check.answer === "not_applicable" && check.id !== "battery"))) return null;
  return checks;
}

function comparisonFact(item: ComparisonItem): ComparisonFact {
  const listing = item.availability === "available" && item.listing?.listing_id === item.listing_id ? item.listing : null;
  const checks = listing ? validChecks(item) : null;
  const knownChecks = checks?.filter(known) ?? null;
  const battery = checks?.find((check) => check.id === "battery");
  const rawHealth = item.passport?.battery_health_percent;
  const batteryHealth = battery && ["ok", "issue"].includes(battery.answer) && typeof rawHealth === "number" && Number.isInteger(rawHealth) && rawHealth >= 0 && rawHealth <= 100 ? rawHealth : null;
  const amount = listing?.price?.amount;
  const currency = listing?.price?.currency;
  return {
    listing_id: item.listing_id,
    price_amount: typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
    currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : null,
    battery_health_percent: batteryHealth,
    issue_count: knownChecks?.length === SMARTPHONE_CHECK_IDS.length ? knownChecks.filter((check) => check.answer === "issue").length : null,
    known_check_count: knownChecks ? knownChecks.length : null,
    declared_count: knownChecks ? knownChecks.filter((check) => check.photos.length === 0).length : null,
    documented_count: knownChecks ? knownChecks.filter((check) => check.photos.length > 0).length : null
  };
}

/** Compares one declared metric, never overall quality, authenticity or runtime.
 * Photos only affect descriptive counts; they never affect the ranking.
 * Missing values remain null and ties remain explicit. */
export function deriveComparison(items: ComparisonItem[], priority: ComparisonPriority): ComparisonResult {
  const facts = items.map(comparisonFact);
  const result = (status: ComparisonResult["status"], blockedIds: string[] = [], winnerIds: string[] = []): ComparisonResult => ({ priority, status, winnerIds, facts, blockedIds });
  if (items.length < 2 || items.length > MAX_SMARTPHONE_COMPARISON_ITEMS || new Set(items.map((item) => item.listing_id)).size !== items.length) return result("needs_selection");
  const unavailable = items.filter((item) => item.availability !== "available" || !item.listing || item.listing.listing_id !== item.listing_id).map((item) => item.listing_id);
  if (unavailable.length) return result("unavailable", unavailable);
  const missingCurrency = facts.filter((fact) => fact.currency === null).map((fact) => fact.listing_id);
  if (missingCurrency.length) return result("incomplete", missingCurrency);
  if (new Set(facts.map((fact) => fact.currency)).size !== 1) return result("different_currencies", items.map((item) => item.listing_id));
  const metric = priority === "budget" ? "price_amount" : priority === "battery" ? "battery_health_percent" : "issue_count";
  const incomplete = facts.filter((fact) => fact[metric] === null).map((fact) => fact.listing_id);
  if (incomplete.length) return result("incomplete", incomplete);
  const values = facts.map((fact) => fact[metric] as number);
  const best = priority === "battery" ? Math.max(...values) : Math.min(...values);
  const winners = facts.filter((fact) => fact[metric] === best).map((fact) => fact.listing_id);
  return result(winners.length > 1 ? "tie" : "ranked", [], winners);
}
