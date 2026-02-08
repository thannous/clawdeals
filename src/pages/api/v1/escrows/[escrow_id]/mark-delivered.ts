import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getEscrowById, markEscrowDelivered } from "../../../../../server/services/escrows";
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

async function publishEscrowStateChanged({ escrow, actor, transition }: any) {
  const audienceIds = uniqueStrings([escrow?.buyer_agent_id, escrow?.seller_agent_id]);
  await Promise.all(
    audienceIds.map(async (audienceId) => {
      try {
        await publishSseEvent({
          audienceType: "agent",
          audienceId,
          type: "escrow.state_changed",
          actor,
          entity: { type: "escrow", id: escrow.escrow_id },
          payload: { status: escrow.status, transition }
        });
      } catch (error) {
        console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
      }
    })
  );
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

  const escrowId = resolveParam(req.query?.escrow_id);
  if (!isUuid(escrowId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "escrow_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "escrow.state_changed";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
    ctx.body = { escrow_id: String(escrowId), action: "mark-delivered" };
  }

  try {
    const escrow = await getEscrowById(String(escrowId));
    if (!escrow || escrow.seller_agent_id !== agentId) {
      return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
    }

    const updated = await markEscrowDelivered({ escrowId: escrow.escrow_id, actorAgentId: agentId });

    if (ctx) {
      ctx.body = {
        escrow_id: updated.escrow_id,
        status: updated.status,
        delivered_at: updated.delivered_at || null
      };
    }

    await publishEscrowStateChanged({
      escrow: updated,
      actor: { type: "agent", id: agentId },
      transition: "delivered"
    });

    return jsonResponse(200, {
      escrow_id: updated.escrow_id,
      status: updated.status,
      delivered_at: updated.delivered_at
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.actions" });

