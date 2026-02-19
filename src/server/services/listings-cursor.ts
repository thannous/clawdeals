import { isUuid } from "../utils/validators";

const SORTS = new Set(["recent", "price_asc", "price_desc", "distance", "rank"]);
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: string) {
  if (typeof value !== "string") return false;
  if (!ISO_TIMESTAMP_RE.test(value)) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(raw: string) {
  // Normalize:
  // - Some tooling decodes '+' as space in query strings.
  // - Accept both base64url and legacy base64.
  let normalized = raw.trim().replace(/ /g, "+");
  normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");

  // Pad to a multiple of 4.
  const padLen = normalized.length % 4;
  if (padLen === 2) normalized += "==";
  else if (padLen === 3) normalized += "=";
  else if (padLen !== 0) {
    throw new Error("invalid_base64");
  }

  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeListingsCursor(cursor: any) {
  if (!cursor) return null;
  const payload = JSON.stringify(cursor);
  return base64UrlEncode(payload);
}

export function decodeListingsCursor(raw: any) {
  if (!raw || typeof raw !== "string") return null;

  let decoded;
  try {
    decoded = base64UrlDecode(raw);
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }

  const sort = (parsed as any).sort;
  if (typeof sort !== "string" || !SORTS.has(sort)) {
    return { error: "Invalid cursor" };
  }

  if (sort === "recent") {
    if (!isIsoTimestamp((parsed as any).created_at)) return { error: "Invalid cursor" };
    if (!isUuid((parsed as any).listing_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        created_at: (parsed as any).created_at,
        listing_id: (parsed as any).listing_id
      }
    };
  }

  if (sort === "rank") {
    if (!isIsoTimestamp((parsed as any).as_of)) return { error: "Invalid cursor" };
    const rankScore = (parsed as any).rank_score;
    if (typeof rankScore !== "number" && typeof rankScore !== "string") return { error: "Invalid cursor" };
    if (!isIsoTimestamp((parsed as any).created_at)) return { error: "Invalid cursor" };
    if (!isUuid((parsed as any).listing_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        as_of: (parsed as any).as_of,
        rank_score: rankScore,
        created_at: (parsed as any).created_at,
        listing_id: (parsed as any).listing_id
      }
    };
  }

  if (sort === "distance") {
    const distanceM = (parsed as any).distance_m;
    if (typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM < 0) {
      return { error: "Invalid cursor" };
    }
    if (!isUuid((parsed as any).listing_id)) return { error: "Invalid cursor" };

    const lat = (parsed as any).lat;
    const lng = (parsed as any).lng;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { error: "Invalid cursor" };
    }
    if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { error: "Invalid cursor" };
    }

    const distanceKm = (parsed as any).distance_km;
    if (distanceKm !== null && distanceKm !== undefined) {
      if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm) || !Number.isSafeInteger(distanceKm)) {
        return { error: "Invalid cursor" };
      }
      if (distanceKm < 1 || distanceKm > 300) {
        return { error: "Invalid cursor" };
      }
    }

    return {
      value: {
        sort,
        distance_m: distanceM,
        listing_id: (parsed as any).listing_id,
        lat,
        lng,
        distance_km: distanceKm ?? null
      }
    };
  }

  if (sort === "price_asc" || sort === "price_desc") {
    const priceAmount = (parsed as any).price_amount;
    if (typeof priceAmount !== "number" || !Number.isFinite(priceAmount) || !Number.isSafeInteger(priceAmount)) {
      return { error: "Invalid cursor" };
    }
    if (!isUuid((parsed as any).listing_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        price_amount: priceAmount,
        listing_id: (parsed as any).listing_id
      }
    };
  }

  return { error: "Invalid cursor" };
}
