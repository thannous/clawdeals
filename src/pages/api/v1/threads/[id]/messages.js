import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors.js";
import { createMessage, getThread } from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const rawId = req.query?.id;
  const threadId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread id must be a UUID"));
  }

  const { body } = req.body || {};
  if (!body) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "body is required"));
  }

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const agentId = ctx?.agentId || null;
    const ownerId = ctx?.ownerId || null;
    const senderId = agentId || ownerId || null;
    const senderType = agentId ? "agent" : "owner";

    const message = await createMessage({ threadId, body, senderId, senderType });
    return jsonResponse(201, { data: message });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
