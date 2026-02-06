import { isUuid } from "../utils/validators";

const SORTS = new Set(["recent", "price_asc", "price_desc"]);

export function encodeListingsCursor(cursor: any) {
  if (!cursor) return null;
  const payload = JSON.stringify(cursor);
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeListingsCursor(raw: any) {
  if (!raw || typeof raw !== "string") return null;

  let decoded;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
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
    if (typeof (parsed as any).created_at !== "string") return { error: "Invalid cursor" };
    if (!isUuid((parsed as any).listing_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        created_at: (parsed as any).created_at,
        listing_id: (parsed as any).listing_id
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

