import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getThread, listMessages } from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "thread.viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const threadId = resolveParam(req.query?.thread_id);
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread_id must be a UUID"));
  }

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const messagesResult = await listMessages({ threadId, limit: 50 });

    return jsonResponse(200, {
      thread,
      messages: messagesResult.items,
      messages_next_cursor: messagesResult.nextCursor
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "threads.read" }));
