import { normalizeTags } from "./deals";
import { DEAL_TYPES, COUNTRY_RE, DELIVERY_METHODS } from "../config/deals";
import { normalizeBuyMission } from "./buy-missions";

function parseStrictInteger(value) {
  // Accept either a number (must already be an integer) or a digits-only string.
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n)) return null;
    return n;
  }

  return null;
}

export function parseWatchlistCriteria(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("criteria is required");
  }

  let query = null;
  const rawQuery = raw.query;
  if (rawQuery !== undefined && rawQuery !== null) {
    if (typeof rawQuery !== "string") {
      throw new Error("criteria.query must be a string");
    }
    const trimmed = rawQuery.trim();
    if (trimmed) {
      if (trimmed.length > 80) {
        throw new Error("criteria.query must be 1..80 characters");
      }
      query = trimmed;
    } else {
      query = null;
    }
  }

  let tags = [];
  if (raw.tags !== undefined && raw.tags !== null) {
    tags = normalizeTags(raw.tags, { maxCount: 20 });
  }

  let priceMax = null;
  if (raw.price_max !== undefined && raw.price_max !== null) {
    if (typeof raw.price_max !== "number" || !Number.isFinite(raw.price_max)) {
      throw new Error("criteria.price_max must be a number");
    }
    if (raw.price_max <= 0) {
      throw new Error("criteria.price_max must be greater than 0");
    }
    priceMax = raw.price_max;
  }

  let geo = null;
  let geoLat = null;
  let geoLon = null;
  if (raw.geo !== undefined && raw.geo !== null) {
    if (!raw.geo || typeof raw.geo !== "object" || Array.isArray(raw.geo)) {
      throw new Error("criteria.geo must be an object");
    }
    const lat = raw.geo.lat;
    const lon = raw.geo.lon;
    if (typeof lat !== "number" || !Number.isFinite(lat)) {
      throw new Error("criteria.geo.lat must be a number");
    }
    if (typeof lon !== "number" || !Number.isFinite(lon)) {
      throw new Error("criteria.geo.lon must be a number");
    }
    if (lat < -90 || lat > 90) {
      throw new Error("criteria.geo.lat must be between -90 and 90");
    }
    if (lon < -180 || lon > 180) {
      throw new Error("criteria.geo.lon must be between -180 and 180");
    }
    geo = { lat, lon };
    geoLat = lat;
    geoLon = lon;
  }

  let distanceKm = null;
  if (raw.distance_km !== undefined && raw.distance_km !== null) {
    const parsed = parseStrictInteger(raw.distance_km);
    if (parsed === null) {
      throw new Error("criteria.distance_km must be an integer");
    }
    if (parsed < 1 || parsed > 300) {
      throw new Error("criteria.distance_km must be between 1 and 300");
    }
    distanceKm = parsed;
  }

  if (distanceKm !== null && !geo) {
    throw new Error("criteria.distance_km requires criteria.geo");
  }
  if (geo && distanceKm === null) {
    throw new Error("criteria.distance_km is required when criteria.geo is provided");
  }

  let dealType = null;
  if (raw.deal_type !== undefined && raw.deal_type !== null) {
    if (typeof raw.deal_type !== "string") {
      throw new Error("criteria.deal_type must be a string");
    }
    const dt = raw.deal_type.trim().toUpperCase();
    if (!DEAL_TYPES.has(dt)) {
      throw new Error("criteria.deal_type must be ONLINE or LOCAL");
    }
    dealType = dt;
  }

  let country = null;
  if (raw.country !== undefined && raw.country !== null) {
    if (typeof raw.country !== "string") {
      throw new Error("criteria.country must be a string");
    }
    const c = raw.country.trim().toUpperCase();
    if (!COUNTRY_RE.test(c)) {
      throw new Error("criteria.country must be a 2-letter ISO code");
    }
    country = c;
  }

  let deliveryMethod = null;
  if (raw.delivery_method !== undefined && raw.delivery_method !== null) {
    if (typeof raw.delivery_method !== "string") {
      throw new Error("criteria.delivery_method must be a string");
    }
    const dm = raw.delivery_method.trim().toUpperCase();
    if (!DELIVERY_METHODS.has(dm)) {
      throw new Error("criteria.delivery_method must be PICKUP, SHIPPING, or BOTH");
    }
    deliveryMethod = dm;
  }

  // Candidate prefiltering still relies on legacy top-level fields; keep at least one
  // legacy criterion required so criteria-only JSON filters don't silently never match.
  const hasAnyCriterion = Boolean(query) || tags.length > 0 || priceMax !== null || geo !== null;
  if (!hasAnyCriterion) {
    throw new Error("criteria must include at least one filter");
  }

  let mission = null;
  if (raw.mission !== undefined && raw.mission !== null) {
    mission = normalizeBuyMission(raw.mission);
    if (!query) throw new Error("criteria.query is required for a buy mission");
    if (!geo || distanceKm === null) {
      throw new Error("criteria.geo and criteria.distance_km are required for a buy mission");
    }
    if (
      geo.lat !== mission.location.lat ||
      geo.lon !== mission.location.lon ||
      distanceKm !== mission.location.radius_km
    ) {
      throw new Error("criteria geo must match criteria.mission.location");
    }
  }

  const criteria = {
    query,
    tags,
    price_max: priceMax,
    geo,
    distance_km: distanceKm,
    deal_type: dealType,
    country,
    delivery_method: deliveryMethod,
    ...(mission ? { mission } : {})
  };

  return {
    criteria,
    queryText: query,
    tags,
    priceMax,
    geoLat,
    geoLon,
    distanceKm
  };
}
