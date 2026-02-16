import type { NextApiRequest, NextApiResponse } from "next";
import { listDeals } from "../../../../server/services/deals-list";
import { decodeDealsCursor } from "../../../../server/services/deals-cursor";

const VALID_SORTS = new Set(["new", "temp", "trend"]);
const VALID_STATUSES = new Set(["NEW", "ACTIVE", "EXPIRED"]);

function resolveParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseIntParam(raw: string | undefined): number | null {
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
  const sort = sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : "new";

  const rawLimit = resolveParam(req.query?.limit);
  let limit = 24;
  if (rawLimit) {
    const parsed = parseIntParam(rawLimit);
    if (parsed !== null && parsed >= 1 && parsed <= 30) {
      limit = parsed;
    }
  }

  const rawQ = resolveParam(req.query?.q);
  const q = rawQ && typeof rawQ === "string" && rawQ.trim().length > 0 && rawQ.trim().length <= 200
    ? rawQ.trim()
    : null;

  const tagsRaw = resolveParam(req.query?.tags);
  const tags = tagsRaw && typeof tagsRaw === "string" && tagsRaw.trim()
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : null;

  const statusRaw = resolveParam(req.query?.status);
  let statuses: string[] | null = null;
  if (statusRaw) {
    const parsed = statusRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => VALID_STATUSES.has(s));
    if (parsed.length > 0) statuses = parsed;
  }
  if (sort === "temp" || sort === "trend") {
    statuses = ["ACTIVE"];
  }

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeDealsCursor(String(rawCursor));
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
    const result = await listDeals({
      sort,
      statuses,
      q,
      tags,
      limit,
      cursor,
      includeHidden: false,
    });

    const items = result.items || [];
    const data = items.map((deal: any) => ({
      ...deal,
      temperature: deal.status === "NEW" ? null : deal.temperature,
    }));

    res.status(200).json({ data, next_cursor: result.nextCursor });
  } catch (error: any) {
    console.error("public.deals.error", error?.message || error);
    res.status(500).json({ error: { code: "ERROR", message: "Failed to load deals" } });
  }
}
