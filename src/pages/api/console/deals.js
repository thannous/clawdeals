import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { listDeals, DEALS_DEFAULT_LIMIT, DEALS_MAX_LIMIT } from "../../../server/services/deals-list";
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

function parseCsvValues(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "deals.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const sortRaw = resolveParam(req.query?.sort);
  const sort = sortRaw ? String(sortRaw).toLowerCase() : "new";
  if (sort !== "new" && sort !== "temp" && sort !== "trend") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort is invalid"));
  }

  const STATUS_VALUES = new Set(["NEW", "ACTIVE", "EXPIRED"]);
  let statuses = parseCsvValues(req.query?.status).map((value) => value.toUpperCase());
  if (statuses.length && statuses.some((value) => !STATUS_VALUES.has(value))) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status is invalid"));
  }
  statuses = Array.from(new Set(statuses));

  if (sort === "temp" || sort === "trend") {
    if (statuses.length && (statuses.length !== 1 || statuses[0] !== "ACTIVE")) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status must be ACTIVE for this sort"));
    }
    statuses = ["ACTIVE"];
  } else if (!statuses.length) {
    statuses = ["NEW", "ACTIVE"];
  }

  const qRaw = resolveParam(req.query?.q);
  const q = qRaw === undefined || qRaw === null || qRaw === "" ? null : String(qRaw).trim();
  if (q && q.length > 80) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "q must be 1..80 characters"));
  }

  const tags = parseCsvValues(req.query?.tags);

  const limitRaw = resolveParam(req.query?.limit);
  let limit = DEALS_DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
    const parsed = Number.parseInt(String(limitRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > DEALS_MAX_LIMIT) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${DEALS_MAX_LIMIT}`));
    }
    limit = parsed;
  }

  const cursorRaw = resolveParam(req.query?.cursor);
  let cursor = null;
  if (cursorRaw) {
    const parsed = decodeDealsCursor(cursorRaw);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    if (parsed?.value?.sort !== sort) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match sort"));
    }
    cursor = parsed?.value || null;
  }

  try {
    const result = await listDeals({ sort, statuses, q: q || null, tags: tags.length ? tags : null, limit, cursor });

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

    return jsonResponse(200, { items, next_cursor: result.nextCursor });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "deals.read" }));

