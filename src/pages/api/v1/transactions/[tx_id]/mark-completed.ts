import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { markTransactionCompleted } from "../../../../../server/services/transactions";
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

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  if (ctx) {
    ctx.body = { tx_id: txId, action: "mark_completed" };
  }

  try {
    const result = await markTransactionCompleted({ txId: String(txId), actorAgentId: agentId });

    const status = result.tx_status || result.status || null;
    const listingId = result.listing_id || null;

    const isBuyer = result.buyer_agent_id === agentId;
    const isSeller = result.seller_agent_id === agentId;

    if (ctx) {
      const event = status === "COMPLETED"
        ? "transaction.completed"
        : isBuyer
          ? "transaction.buyer_marked_completed"
          : isSeller
            ? "transaction.seller_marked_completed"
            : "transaction.mark_completed";

      ctx.auditEvent = event;
      if (ctx.body && typeof ctx.body === "object") {
        Object.assign(ctx.body, {
          listing_id: listingId,
          status,
          buyer_completed_at: result.buyer_completed_at || null,
          seller_completed_at: result.seller_completed_at || null,
          auto_completed: Boolean(result.auto_completed)
        });
      }
    }

    const audienceIds = uniqueStrings([result.buyer_agent_id, result.seller_agent_id]);

    if (status === "COMPLETED") {
      await Promise.all(
        audienceIds.map(async (audienceId) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "transaction.completed",
              actor: { type: "agent", id: agentId },
              entity: { type: "transaction", id: result.tx_id },
              payload: {
                listing_id: listingId,
                status: "COMPLETED",
                auto_completed: Boolean(result.auto_completed)
              }
            });
          } catch (error) {
            console.info("sse.publish_failed", { type: "transaction.completed", error: error?.message || String(error) });
          }
        })
      );

      return jsonResponse(200, {
        tx_id: result.tx_id,
        status: "COMPLETED",
        buyer_completed_at: result.buyer_completed_at,
        seller_completed_at: result.seller_completed_at,
        auto_completed: Boolean(result.auto_completed),
        message: Boolean(result.auto_completed)
          ? "Transaction completed (auto-closed)"
          : "Transaction completed successfully"
      });
    }

    await Promise.all(
      audienceIds.map(async (audienceId) => {
        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "transaction.pending_confirm",
            actor: { type: "agent", id: agentId },
            entity: { type: "transaction", id: result.tx_id },
            payload: {
              listing_id: listingId,
              status: "COMPLETED_PENDING_CONFIRM"
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "transaction.pending_confirm", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(200, {
      tx_id: result.tx_id,
      status: "COMPLETED_PENDING_CONFIRM",
      buyer_completed_at: result.buyer_completed_at,
      seller_completed_at: result.seller_completed_at,
      message: "Waiting for other party to confirm completion"
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "transactions.actions" });

