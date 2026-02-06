import { listDeals } from "../../../server/services/deals-list";
import { decodeDealsCursor } from "../../../server/services/deals-cursor";

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is allowed" } });
  }

  const sortValue = resolveParam(req.query.sort) || "new";
  const statusParam = req.query.status;
  let statuses;
  if (statusParam) {
    const arr = Array.isArray(statusParam) ? statusParam : [statusParam];
    statuses = arr.flatMap(s => s.split(",")).map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  const q = resolveParam(req.query.q) || undefined;
  const tagsParam = req.query.tags;
  let tags;
  if (tagsParam) {
    const arr = Array.isArray(tagsParam) ? tagsParam : [tagsParam];
    tags = arr.flatMap(t => t.split(",")).map(t => t.trim()).filter(Boolean);
  }
  const limit = parseInt(resolveParam(req.query.limit), 10) || 30;
  const cursorParam = resolveParam(req.query.cursor);

  let cursor = null;
  if (cursorParam) {
    const parsed = decodeDealsCursor(cursorParam);
    if (parsed?.error) {
      return res.status(400).json({ error: { code: "INVALID_CURSOR", message: parsed.error } });
    }
    cursor = parsed?.value || null;
  }

  try {
    const result = await listDeals({ sort: sortValue, statuses, q, tags, limit, cursor });

    const items = (result.items || []).map((deal) => ({
      deal_id: deal.deal_id,
      title: deal.title,
      source_url: deal.source_url,
      price: toNumber(deal.price),
      currency: deal.currency,
      expires_at: deal.expires_at,
      tags: deal.tags || [],
      status: deal.status,
      temperature: deal.status === "NEW" ? null : deal.temperature,
      votes_up: deal.votes_up,
      votes_down: deal.votes_down,
      created_at: deal.created_at
    }));

    return res.status(200).json({ items, next_cursor: result.nextCursor });
  } catch (error) {
    return res.status(error.status || 500).json({ error: { code: error.code || "ERROR", message: error.message } });
  }
}
