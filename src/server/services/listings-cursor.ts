import { decodeJsonCursor, isCursorTimestamp } from "../utils/json-cursor";
import { isUuid } from "../utils/validators";

export { encodeJsonCursor as encodeListingsCursor } from "../utils/json-cursor";

function readListingCursor(fields: Record<string, unknown>) {
  const { sort, listing_id, created_at } = fields;
  if (typeof listing_id !== "string" || !isUuid(listing_id)) return null;

  switch (sort) {
    case "recent":
      return isCursorTimestamp(created_at) ? { sort, created_at, listing_id } : null;
    case "rank": {
      const { as_of, rank_score } = fields;
      if (!isCursorTimestamp(as_of) || !isCursorTimestamp(created_at)) return null;
      if (typeof rank_score !== "number" && typeof rank_score !== "string") return null;
      return { sort, as_of, rank_score, created_at, listing_id };
    }
    case "distance": {
      const { distance_m, lat, lng, distance_km } = fields;
      if (typeof distance_m !== "number" || !Number.isFinite(distance_m) || distance_m < 0) return null;
      if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
      if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
      if (distance_km != null &&
        (typeof distance_km !== "number" || !Number.isSafeInteger(distance_km) || distance_km < 1 || distance_km > 300)) {
        return null;
      }
      return { sort, distance_m, listing_id, lat, lng, distance_km: distance_km ?? null };
    }
    case "price_asc":
    case "price_desc": {
      const { price_amount } = fields;
      return typeof price_amount === "number" && Number.isSafeInteger(price_amount) ? { sort, price_amount, listing_id } : null;
    }
    default:
      return null;
  }
}

export function decodeListingsCursor(raw: unknown) {
  return decodeJsonCursor(raw, readListingCursor);
}
