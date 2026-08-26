import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { acceptOffer, getOffer } from "../../../../../server/services/offers";
import { publishSseEvent } from "../../../../../server/sse/store";
import { safeAuditLog } from "../../../../../server/audit/singleton";
import { enforceBuyMissionOffer } from "../../../../../server/policy/buy-mission-guard";

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

  const rawMissionId = req.body?.mission_id;
  const missionId =
    rawMissionId === undefined || rawMissionId === null || rawMissionId === ""
      ? null
      : typeof rawMissionId === "string"
        ? rawMissionId
        : null;
  if (
    rawMissionId !== undefined &&
    rawMissionId !== null &&
    rawMissionId !== "" &&
    (!missionId || !isUuid(missionId))
  ) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "mission_id must be a UUID"));
  }

  if (ctx) {
    ctx.body = { offer_id: offerId, action: "accept", mission_id: missionId };
  }

  try {
    if (missionId) {
      const offer = await getOffer(offerId);
      const isBuyer = offer?.buyer_agent_id === agentId;
      const isSeller = offer?.seller_agent_id === agentId;
      if (!offer || (!isBuyer && !isSeller)) {
        return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
      }
      if (!isBuyer) {
        return jsonResponse(
          400,
          errorPayload("VALIDATION_ERROR", "mission_id is only valid for the buyer")
        );
      }
      if (String(offer.buy_mission_id || "") !== missionId) {
        return jsonResponse(
          409,
          errorPayload("MISSION_MISMATCH", "Mission does not match the offer chain")
        );
      }
      await enforceBuyMissionOffer({
        missionId,
        agentId,
        amount: Number(offer.amount),
        currency: String(offer.currency || "")
      });
    }

    const result = await acceptOffer({ offerId, actorAgentId: agentId });

    const transaction = {
      tx_id: result.tx_id,
      listing_id: result.listing_id,
      thread_id: result.thread_id,
      accepted_offer_id: result.accepted_offer_id,
      buyer_agent_id: result.buyer_agent_id,
      seller_agent_id: result.seller_agent_id,
      status: result.tx_status,
      contact_reveal_state: result.contact_reveal_state,
      created_at: result.tx_created_at
    };

    const responseBody = {
      offer_id: result.offer_id,
      status: result.offer_status,
      transaction,
      listing_status: result.listing_status
    };

    if (ctx) {
      ctx.auditEvent = "offer.accept";
      if (ctx.body && typeof ctx.body === "object") {
        Object.assign(ctx.body, {
          listing_id: result.listing_id,
          thread_id: result.thread_id,
          tx_id: result.tx_id
        });
      }
    }

    try {
      await safeAuditLog({
        occurredAt: new Date().toISOString(),
        actor: ctx?.actor || null,
        auth: {
          agent_id: agentId,
          owner_id: ctx?.ownerId || null,
          api_key_id: ctx?.apiKeyId || null,
          api_key_state: ctx?.apiKeyState || null
        },
        request: {
          id: ctx?.requestId || null,
          ip: ctx?.ip || null,
          userAgent: ctx?.userAgent || null,
          method: ctx?.method || null,
          path: ctx?.path || null,
          query: ctx?.query || null
        },
        action: {
          route_group: ctx?.rateLimit?.group || null,
          method: ctx?.method || null,
          path: ctx?.path || null,
          event: "transaction.create"
        },
        security: ctx?.security || {},
        policy: ctx?.policy || {},
        payload: {
          tx_id: transaction.tx_id,
          listing_id: transaction.listing_id,
          thread_id: transaction.thread_id,
          accepted_offer_id: transaction.accepted_offer_id,
          buyer_agent_id: transaction.buyer_agent_id,
          seller_agent_id: transaction.seller_agent_id
        },
        rateLimit: ctx?.rateLimit || null,
        idempotency: ctx?.idempotency || null,
        outcome: "SUCCESS"
      });
    } catch (error) {
      console.info("audit.write_failed", { event: "transaction.create", error: error?.message || String(error) });
    }

    const audienceIds = uniqueStrings([result.buyer_agent_id, result.seller_agent_id]);

    await Promise.all(
      audienceIds.map(async (audienceId) => {
        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "offer.accepted",
            actor: { type: "agent", id: agentId },
            entity: { type: "offer", id: offerId },
            payload: {
              transaction_id: transaction.tx_id,
              listing_id: transaction.listing_id,
              thread_id: transaction.thread_id,
              listing_status: result.listing_status
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "offer.accepted", error: error?.message || String(error) });
        }

        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "transaction.created",
            actor: { type: "agent", id: agentId },
            entity: { type: "transaction", id: transaction.tx_id },
            payload: {
              listing_id: transaction.listing_id,
              thread_id: transaction.thread_id,
              offer_id: offerId,
              status: transaction.status
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "transaction.created", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(200, responseBody);
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "offers.actions" });
