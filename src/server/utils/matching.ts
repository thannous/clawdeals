function coerceString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type TokenizeOptions = {
  maxTokens?: number;
};

export function tokenize(text: any, options: TokenizeOptions = {}): string[] {
  // Default: no cap. Callers can pass `maxTokens` to protect against pathological inputs.
  const maxTokensRaw: any = (options as any)?.maxTokens;
  const maxTokens =
    maxTokensRaw === undefined || maxTokensRaw === null
      ? Infinity
      : Number.isFinite(Number(maxTokensRaw))
        ? Number(maxTokensRaw)
        : Infinity;

  if (maxTokens <= 0) return [];
  const input = coerceString(text);
  if (!input) return [];

  const parts = input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);

  const tokens = [];
  const seen = new Set();
  for (const part of parts) {
    if (part.length < 2) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    tokens.push(part);
    if (tokens.length >= maxTokens) break;
  }
  return tokens;
}

export function buildEntityTokensFromDeal(deal: any): string[] {
  const tokens = [];

  const title = coerceString(deal?.title);
  if (title) {
    tokens.push(...tokenize(title));
  }

  const tags = Array.isArray(deal?.tags) ? deal.tags : [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const normalized = tag.trim().toLowerCase();
    if (normalized) tokens.push(normalized);
  }

  return Array.from(new Set(tokens));
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type WatchlistMatchReason = Record<string, any>;
export type WatchlistMatchResult = {
  matched: boolean;
  reason: WatchlistMatchReason;
};

export type EvaluateWatchlistMatchArgs = {
  deal?: any;
  watchlist?: any;
  entityTokens?: any;
};

export function evaluateWatchlistMatch({ deal, watchlist, entityTokens }: EvaluateWatchlistMatchArgs = {}): WatchlistMatchResult {
  if (!deal || typeof deal !== "object") return { matched: false, reason: { invalid: true } };
  if (!watchlist || typeof watchlist !== "object") return { matched: false, reason: { invalid: true } };

  if (watchlist.active === false || watchlist.deleted_at) {
    return { matched: false, reason: { inactive: true } };
  }

  const reason: WatchlistMatchReason = {};

  const tokens = Array.isArray(entityTokens) ? entityTokens : buildEntityTokensFromDeal(deal);
  const tokenSet = new Set(tokens.map((t) => String(t || "").toLowerCase()).filter(Boolean));

  const queryText = coerceString(watchlist.query_text) || coerceString(watchlist?.criteria?.query);
  const queryTokens = tokenize(queryText);
  if (queryTokens.length > 0) {
    reason.query_tokens = queryTokens;
    for (const token of queryTokens) {
      if (!tokenSet.has(token)) {
        return { matched: false, reason: { ...reason, query_ok: false } };
      }
    }
    reason.query_ok = true;
  }

  const dealTags = Array.isArray(deal?.tags) ? deal.tags : [];
  const dealTagSet = new Set(
    dealTags
      .filter((t) => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );

  const watchlistTags = Array.isArray(watchlist?.tags) ? watchlist.tags : [];
  if (watchlistTags.length > 0) {
    const matchedTags = watchlistTags
      .filter((t) => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .filter((t) => dealTagSet.has(t));

    const uniqueMatched = Array.from(new Set(matchedTags));
    if (uniqueMatched.length === 0) {
      return { matched: false, reason: { ...reason, tags_ok: false } };
    }
    reason.tags_ok = true;
    reason.tags_matched = uniqueMatched;
  }

  const watchlistHasGeo =
    watchlist.geo_lat !== null && watchlist.geo_lat !== undefined
      ? true
      : watchlist.geo_lon !== null && watchlist.geo_lon !== undefined
        ? true
        : watchlist.distance_km !== null && watchlist.distance_km !== undefined
          ? true
          : Boolean(watchlist?.criteria?.geo);

  if (watchlistHasGeo) {
    // Deals don't have geo in v0; any watchlist requiring geo is a safe non-match.
    return { matched: false, reason: { ...reason, geo_missing: true } };
  }

  const priceMaxRaw =
    watchlist.price_max !== null && watchlist.price_max !== undefined ? watchlist.price_max : watchlist?.criteria?.price_max;
  const hasPrice = priceMaxRaw !== null && priceMaxRaw !== undefined;
  if (hasPrice) {
    const currency = coerceString(deal.currency);
    const normalizedCurrency = currency ? currency.toUpperCase() : null;
    if (normalizedCurrency !== "EUR") {
      return { matched: false, reason: { ...reason, currency_mismatch: true } };
    }

    const priceMax = toNumber(priceMaxRaw);
    const dealPrice = toNumber(deal.price);
    if (!Number.isFinite(priceMax) || !Number.isFinite(dealPrice)) {
      return { matched: false, reason: { ...reason, price_invalid: true } };
    }

    if (dealPrice > priceMax) {
      return { matched: false, reason: { ...reason, price_ok: false } };
    }
    reason.price_ok = true;
  }

  return { matched: true, reason };
}
