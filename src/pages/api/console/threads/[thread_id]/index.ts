import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getThread, listMessages } from "../../../../../server/services/threads";
import { listOffersByIds } from "../../../../../server/services/offers";
import { isUuid } from "../../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractOfferIds(messages: any[] = []) {
  const ids = new Set<string>();
  for (const message of messages) {
    const payload = message?.payload;
    if (!payload || typeof payload !== "object") continue;
    const offerId = (payload as any).offer_id;
    if (typeof offerId === "string" && isUuid(offerId)) {
      ids.add(offerId);
    }
  }
  return Array.from(ids);
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

    const messages = messagesResult.items || [];
    const offerIds = extractOfferIds(messages);
    if (offerIds.length > 0) {
      const offers = await listOffersByIds(offerIds);
      const offerMap = new Map<string, any>();
      for (const offer of offers) {
        if (offer?.offer_id) {
          offerMap.set(offer.offer_id, offer);
        }
      }
      for (const message of messages) {
        const payload = message?.payload;
        const offerId = payload && typeof payload === "object" ? (payload as any).offer_id : null;
        if (typeof offerId === "string" && offerMap.has(offerId)) {
          (message as any).offer = offerMap.get(offerId);
        }
      }
    }

    return jsonResponse(200, {
      thread,
      messages,
      messages_next_cursor: messagesResult.nextCursor
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "threads.read" }));
