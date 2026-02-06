import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import {
  DEAL_VOTES_DEFAULT_LIMIT,
  DEAL_VOTES_MAX_LIMIT,
  decodeDealVotesCursor,
  listDealVotes
} from "../../../../../server/services/deal-votes";
import { isUuid } from "../../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "deal.votes_listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId && !ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  const directionRaw = resolveParam(req.query?.direction);
  const direction =
    directionRaw === undefined || directionRaw === null || directionRaw === ""
      ? null
      : String(directionRaw).toLowerCase();
  if (direction !== null && direction !== "up" && direction !== "down") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "direction must be up or down"));
  }

  const limitRaw = resolveParam(req.query?.limit);
  let limit = DEAL_VOTES_DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
    const parsed = Number.parseInt(String(limitRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > DEAL_VOTES_MAX_LIMIT) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${DEAL_VOTES_MAX_LIMIT}`)
      );
    }
    limit = parsed;
  }

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeDealVotesCursor(rawCursor);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    if (parsed?.value?.deal_id !== dealId) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match deal_id"));
    }
    const cursorDirection = parsed?.value?.direction ?? null;
    if (cursorDirection !== direction) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match direction"));
    }
    cursor = parsed?.value || null;
  }

  try {
    const result = await listDealVotes({
      dealId,
      direction,
      limit,
      cursor
    });

    const items = (result.items || []).map((vote) => ({
      direction: vote.direction === 1 ? "up" : "down",
      reason: vote.reason,
      weight: toNumber(vote.weight),
      created_at: vote.created_at
    }));

    return jsonResponse(200, {
      items,
      next_cursor: result.nextCursor
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);

