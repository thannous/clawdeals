import type { NextApiRequest, NextApiResponse } from "next";
import { listPublicListings, mapPublicListingRow } from "../../../../server/services/public-listings";
import { decodeListingsCursor } from "../../../../server/services/listings-cursor";

const CONDITIONS = new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]);
const VALID_SORTS = new Set(["recent", "price_asc", "price_desc"]);

function resolveParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseIntParam(raw: string | undefined, name: string): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const trimmed = String(raw).trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is allowed" } });
    return;
  }

  // Cache at the edge
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");

  const sortRaw = resolveParam(req.query?.sort);
  const sort = sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : "recent";

  const rawLimit = resolveParam(req.query?.limit);
  let limit = 24;
  if (rawLimit) {
    const parsed = parseIntParam(rawLimit, "limit");
    if (parsed !== null && parsed >= 1 && parsed <= 30) {
      limit = parsed;
    }
  }

  const rawQ = resolveParam(req.query?.q);
  const q = rawQ && typeof rawQ === "string" && rawQ.trim().length > 0 && rawQ.trim().length <= 200
    ? rawQ.trim()
    : null;

  const categoryRaw = resolveParam(req.query?.category);
  const category = categoryRaw && typeof categoryRaw === "string" && categoryRaw.trim()
    ? categoryRaw.trim()
    : null;

  const conditionRaw = resolveParam(req.query?.condition);
  let condition: string | null = null;
  if (conditionRaw) {
    const normalized = String(conditionRaw).trim().toUpperCase();
    if (CONDITIONS.has(normalized)) condition = normalized;
  }

  const priceMin = parseIntParam(resolveParam(req.query?.price_min), "price_min");
  const priceMax = parseIntParam(resolveParam(req.query?.price_max), "price_max");

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeListingsCursor(String(rawCursor));
    if (parsed?.error) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error } });
      return;
    }
    if (parsed?.value?.sort !== sort) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "cursor does not match sort" } });
      return;
    }
    cursor = parsed?.value || null;
  }

  try {
    const result = await listPublicListings({
      q,
      category,
      condition,
      priceMin: priceMin != null && priceMin >= 0 ? priceMin : undefined,
      priceMax: priceMax != null && priceMax >= 0 ? priceMax : undefined,
      sort,
      limit,
      cursor,
    });

    const data = (result.items || []).map(mapPublicListingRow);
    res.status(200).json({ data, next_cursor: result.nextCursor });
  } catch (error: any) {
    console.error("public.listings.error", error?.message || error);
    res.status(500).json({ error: { code: "ERROR", message: "Failed to load listings" } });
  }
}
