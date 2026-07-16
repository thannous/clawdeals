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

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

  const dealMarket = coerceString(deal.market_code);
  const watchlistMarket = coerceString(watchlist.market_code);
  if (!dealMarket || !watchlistMarket || dealMarket.toUpperCase() !== watchlistMarket.toUpperCase()) {
    return { matched: false, reason: { market_ok: false } };
  }
  reason.market_ok = true;

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
    const watchlistCurrency = coerceString(watchlist.currency);
    if (!watchlistCurrency || normalizedCurrency !== watchlistCurrency.toUpperCase()) {
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

  const criteriaDealType = coerceString(watchlist?.criteria?.deal_type);
  if (criteriaDealType) {
    const dealType = coerceString(deal.deal_type) || "ONLINE";
    if (dealType.toUpperCase() !== criteriaDealType.toUpperCase()) {
      return { matched: false, reason: { ...reason, deal_type_ok: false } };
    }
    reason.deal_type_ok = true;
  }

  const criteriaCountry = coerceString(watchlist?.criteria?.country);
  if (criteriaCountry) {
    const dealCountry = coerceString(deal.country);
    if (!dealCountry || dealCountry.toUpperCase() !== criteriaCountry.toUpperCase()) {
      return { matched: false, reason: { ...reason, country_ok: false } };
    }
    reason.country_ok = true;
  }

  return { matched: true, reason };
}

export function buildEntityTokensFromListing(listing: any): string[] {
  const tokens = [];

  const title = coerceString(listing?.title);
  if (title) {
    tokens.push(...tokenize(title));
  }

  const category = coerceString(listing?.category);
  if (category) {
    const normalizedCategory = category.trim().toLowerCase();
    if (normalizedCategory) tokens.push(normalizedCategory);
    // Keep token-level access too (useful if categories contain multiple parts).
    tokens.push(...tokenize(category));
  }

  return Array.from(new Set(tokens));
}

export type EvaluateWatchlistMatchListingArgs = {
  listing?: any;
  watchlist?: any;
  entityTokens?: any;
};

export function evaluateWatchlistMatchListing({
  listing,
  watchlist,
  entityTokens
}: EvaluateWatchlistMatchListingArgs = {}): WatchlistMatchResult {
  if (!listing || typeof listing !== "object") return { matched: false, reason: { invalid: true } };
  if (!watchlist || typeof watchlist !== "object") return { matched: false, reason: { invalid: true } };

  if (watchlist.active === false || watchlist.deleted_at) {
    return { matched: false, reason: { inactive: true } };
  }

  const reason: WatchlistMatchReason = {};

  const listingMarket = coerceString(listing.market_code);
  const watchlistMarket = coerceString(watchlist.market_code);
  if (!listingMarket || !watchlistMarket || listingMarket.toUpperCase() !== watchlistMarket.toUpperCase()) {
    return { matched: false, reason: { market_ok: false } };
  }
  reason.market_ok = true;

  const tokens = Array.isArray(entityTokens) ? entityTokens : buildEntityTokensFromListing(listing);
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

  const watchlistTags = Array.isArray(watchlist?.tags) ? watchlist.tags : [];
  const listingCategory = coerceString(listing?.category);
  const normalizedCategory = listingCategory ? listingCategory.trim().toLowerCase() : null;

  if (watchlistTags.length > 0) {
    const normalizedWatchlistTags = watchlistTags
      .filter((t) => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedCategory || !normalizedWatchlistTags.includes(normalizedCategory)) {
      return { matched: false, reason: { ...reason, tags_ok: false } };
    }

    reason.tags_ok = true;
    reason.tags_matched = [normalizedCategory];
  }

  const priceMaxRaw =
    watchlist.price_max !== null && watchlist.price_max !== undefined ? watchlist.price_max : watchlist?.criteria?.price_max;
  const hasPrice = priceMaxRaw !== null && priceMaxRaw !== undefined;
  if (hasPrice) {
    const currency = coerceString(listing.currency);
    const normalizedCurrency = currency ? currency.toUpperCase() : null;
    const watchlistCurrency = coerceString(watchlist.currency);
    if (!watchlistCurrency || normalizedCurrency !== watchlistCurrency.toUpperCase()) {
      return { matched: false, reason: { ...reason, currency_mismatch: true } };
    }

    const priceMax = toNumber(priceMaxRaw);
    const listingPrice = toNumber(listing.price_amount);
    if (!Number.isFinite(priceMax) || !Number.isFinite(listingPrice)) {
      return { matched: false, reason: { ...reason, price_invalid: true } };
    }

    if (listingPrice > priceMax) {
      return { matched: false, reason: { ...reason, price_ok: false } };
    }
    reason.price_ok = true;
  }

  const geoLatRaw = watchlist.geo_lat !== null && watchlist.geo_lat !== undefined ? watchlist.geo_lat : watchlist?.criteria?.geo?.lat;
  const geoLonRaw = watchlist.geo_lon !== null && watchlist.geo_lon !== undefined ? watchlist.geo_lon : watchlist?.criteria?.geo?.lon;
  const distanceKmRaw =
    watchlist.distance_km !== null && watchlist.distance_km !== undefined ? watchlist.distance_km : watchlist?.criteria?.distance_km;

  const requiresGeo =
    (geoLatRaw !== null && geoLatRaw !== undefined) ||
    (geoLonRaw !== null && geoLonRaw !== undefined) ||
    (distanceKmRaw !== null && distanceKmRaw !== undefined) ||
    Boolean(watchlist?.criteria?.geo);
  if (requiresGeo) {
    const geoLat = toNumber(geoLatRaw);
    const geoLon = toNumber(geoLonRaw);
    const distanceKm = toNumber(distanceKmRaw);

    const listingLat = toNumber(listing.geo_lat);
    const listingLon = toNumber(listing.geo_lng);

    if (!Number.isFinite(geoLat) || !Number.isFinite(geoLon) || !Number.isFinite(distanceKm)) {
      return { matched: false, reason: { ...reason, geo_invalid: true } };
    }

    if (!Number.isFinite(listingLat) || !Number.isFinite(listingLon)) {
      return { matched: false, reason: { ...reason, geo_missing: true } };
    }

    const km = haversineKm(geoLat, geoLon, listingLat, listingLon);
    if (!Number.isFinite(km)) {
      return { matched: false, reason: { ...reason, geo_invalid: true } };
    }
    reason.geo_km = km;

    if (km > distanceKm) {
      return { matched: false, reason: { ...reason, geo_ok: false } };
    }
    reason.geo_ok = true;
  }

  const criteriaDeliveryMethod = coerceString(watchlist?.criteria?.delivery_method);
  if (criteriaDeliveryMethod) {
    const listingDm = coerceString(listing.delivery_method);
    if (!listingDm) {
      return { matched: false, reason: { ...reason, delivery_method_ok: false } };
    }
    const wanted = criteriaDeliveryMethod.toUpperCase();
    const actual = listingDm.toUpperCase();
    // BOTH matches any; otherwise exact match or listing=BOTH matches anything
    const matches = wanted === "BOTH" || actual === "BOTH" || wanted === actual;
    if (!matches) {
      return { matched: false, reason: { ...reason, delivery_method_ok: false } };
    }
    reason.delivery_method_ok = true;
  }

  return { matched: true, reason };
}
