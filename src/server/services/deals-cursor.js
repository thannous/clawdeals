import { isUuid } from "../utils/validators";

const SORTS = new Set(["new", "temp", "trend"]);
const STATUSES = new Set(["NEW", "ACTIVE", "EXPIRED"]);

export function encodeDealsCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify(cursor);
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeDealsCursor(raw) {
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

  const sort = parsed.sort;
  if (typeof sort !== "string" || !SORTS.has(sort)) {
    return { error: "Invalid cursor" };
  }

  if (sort === "new") {
    const status = parsed.status;
    if (typeof status !== "string" || !STATUSES.has(status)) return { error: "Invalid cursor" };
    if (typeof parsed.created_at !== "string") return { error: "Invalid cursor" };
    if (!isUuid(parsed.deal_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        status,
        created_at: parsed.created_at,
        deal_id: parsed.deal_id
      }
    };
  }

  if (sort === "temp") {
    if (typeof parsed.temperature !== "number" || !Number.isFinite(parsed.temperature)) return { error: "Invalid cursor" };
    if (typeof parsed.created_at !== "string") return { error: "Invalid cursor" };
    if (!isUuid(parsed.deal_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        temperature: parsed.temperature,
        created_at: parsed.created_at,
        deal_id: parsed.deal_id
      }
    };
  }

  if (sort === "trend") {
    if (typeof parsed.as_of !== "string") return { error: "Invalid cursor" };
    if (typeof parsed.trend_score !== "string" && typeof parsed.trend_score !== "number") return { error: "Invalid cursor" };
    if (typeof parsed.active_at !== "string") return { error: "Invalid cursor" };
    if (typeof parsed.created_at !== "string") return { error: "Invalid cursor" };
    if (!isUuid(parsed.deal_id)) return { error: "Invalid cursor" };
    return {
      value: {
        sort,
        as_of: parsed.as_of,
        trend_score: parsed.trend_score,
        active_at: parsed.active_at,
        created_at: parsed.created_at,
        deal_id: parsed.deal_id
      }
    };
  }

  return { error: "Invalid cursor" };
}

