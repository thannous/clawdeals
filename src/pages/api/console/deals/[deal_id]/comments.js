import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import {
  DEAL_COMMENTS_DEFAULT_LIMIT,
  DEAL_COMMENTS_MAX_LIMIT,
  createDealComment,
  decodeDealCommentsCursor,
  listDealComments
} from "../../../../../server/services/deal-comments";
import { isUuid } from "../../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function sanitizeBody(value) {
  const raw = typeof value === "string" ? value : "";
  let body = raw.trim();
  if (!body) return "";
  body = body.replace(/<[^>]*>/g, "");
  return body.trim();
}

function containsUrl(value) {
  if (!value || typeof value !== "string") return false;
  return /\bhttps?:\/\/\S+/i.test(value) || /\bwww\.\S+/i.test(value);
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (ctx) {
    ctx.auditEvent = req.method === "POST" ? "deal.comment_rejected" : "deal.comments_listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId || ctx.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const dealId = resolveParam(req.query?.deal_id);
  if (!isUuid(dealId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "deal_id must be a UUID"));
  }

  if (req.method === "GET") {
    const limitRaw = resolveParam(req.query?.limit);
    let limit = DEAL_COMMENTS_DEFAULT_LIMIT;
    if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
      const parsed = Number.parseInt(String(limitRaw), 10);
      if (Number.isNaN(parsed)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
      }
      if (parsed < 1 || parsed > DEAL_COMMENTS_MAX_LIMIT) {
        return jsonResponse(
          400,
          errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${DEAL_COMMENTS_MAX_LIMIT}`)
        );
      }
      limit = parsed;
    }

    const rawCursor = resolveParam(req.query?.cursor);
    let cursor = null;
    if (rawCursor) {
      const parsed = decodeDealCommentsCursor(rawCursor);
      if (parsed?.error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      if (parsed?.value?.deal_id !== dealId) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match deal_id"));
      }
      cursor = parsed?.value || null;
    }

    try {
      const result = await listDealComments({ dealId, limit, cursor });

      const items = (result.items || []).map((comment) => ({
        deal_comment_id: comment.deal_comment_id,
        deal_id: comment.deal_id,
        comment_type: comment.comment_type,
        body: comment.body,
        author: { type: "human", owner_id: comment.owner_id },
        created_at: comment.created_at
      }));

      return jsonResponse(200, { items, next_cursor: result.nextCursor });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  const { comment_type: commentTypeRaw, body: bodyRaw } = req.body || {};
  const commentType = commentTypeRaw ?? "note";
  if (commentType !== "note") {
    if (ctx) ctx.security = { rejection_code: "VALIDATION_ERROR" };
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "comment_type must be note"));
  }

  const cleanedBody = sanitizeBody(bodyRaw);
  if (!cleanedBody) {
    if (ctx) ctx.security = { rejection_code: "VALIDATION_ERROR" };
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "body is required"));
  }
  if (cleanedBody.length > 1000) {
    if (ctx) ctx.security = { rejection_code: "VALIDATION_ERROR" };
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "body must be 1..1000 characters"));
  }
  if (containsUrl(cleanedBody)) {
    if (ctx) ctx.security = { rejection_code: "URLS_NOT_ALLOWED" };
    return jsonResponse(400, errorPayload("URLS_NOT_ALLOWED", "URLs are not allowed in notes"));
  }

  try {
    const comment = await createDealComment({
      dealId,
      ownerId: ctx.ownerId,
      commentType,
      body: cleanedBody
    });

    if (ctx) {
      ctx.auditEvent = "deal.comment_created";
    }

    return jsonResponse(201, {
      comment: {
        deal_comment_id: comment.deal_comment_id,
        deal_id: comment.deal_id,
        comment_type: comment.comment_type,
        body: comment.body,
        author: { type: "human", owner_id: comment.owner_id },
        created_at: comment.created_at
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

const getHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "deals.comments.read" }));
const postHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "deals.comments.create" }));

export default async function consoleDealComments(req, res) {
  if (req.method === "GET") return getHandler(req, res);
  if (req.method === "POST") return postHandler(req, res);
  return getHandler(req, res);
}

