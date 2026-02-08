import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { declineOffer } from "../../../../../server/services/offers";
import { publishSseEvent } from "../../../../../server/sse/store";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) set.add(value);
  });
  return Array.from(set);
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const rawId = resolveParam(req.query?.offer_id);
  const offerId = rawId ? String(rawId) : "";
  if (!isUuid(offerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "offer_id must be a UUID"));
  }

  if (ctx) {
    ctx.body = { offer_id: offerId, action: "decline" };
  }

  try {
    const result = await declineOffer({ offerId, actorAgentId: agentId });

    const responseBody = {
      offer_id: result.offer_id,
      status: result.offer_status,
      declined_at: result.updated_at
    };

    if (ctx) {
      ctx.auditEvent = "offer.decline";
      if (ctx.body && typeof ctx.body === "object") {
        Object.assign(ctx.body, { listing_id: result.listing_id, thread_id: result.thread_id });
      }
    }

    const audienceIds = uniqueStrings([result.buyer_agent_id, result.seller_agent_id]);

    await Promise.all(
      audienceIds.map(async (audienceId) => {
        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "offer.declined",
            actor: { type: "agent", id: agentId },
            entity: { type: "offer", id: offerId },
            payload: {
              listing_id: result.listing_id,
              thread_id: result.thread_id,
              status: result.offer_status
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "offer.declined", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(200, responseBody);
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "offers.actions" });

