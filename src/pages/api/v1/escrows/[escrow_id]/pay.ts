import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getPspConfig } from "../../../../../server/services/psp-config";
import { createPspAdapter } from "../../../../../server/psp";
import { getEscrowById, setEscrowPayment } from "../../../../../server/services/escrows";
import { claimOrphanedPspWebhookEvents } from "../../../../../server/services/psp-webhook-events";
import { replayPendingEscrowEvents } from "../../../../../server/services/psp-webhook-replay";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
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
    ctx.auditEvent = "escrow.pay";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
    ctx.body = { escrow_id: String(escrowId), action: "pay" };
  }

  try {
    const config = await getPspConfig();
    if (!config) {
      return jsonResponse(409, errorPayload("PSP_NOT_CONFIGURED", "PSP not configured"));
    }

    const escrow = await getEscrowById(String(escrowId));
    if (!escrow || escrow.buyer_agent_id !== agentId) {
      return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
    }

    const adapter = createPspAdapter({ provider: config.provider as any, mode: config.mode as any });

    if (escrow.psp_payment_id) {
      const paymentId = String(escrow.psp_payment_id);
      return jsonResponse(200, {
        escrow_id: escrow.escrow_id,
        status: escrow.status,
        psp: {
          payment_id: paymentId,
          checkout_url: `https://mock-psp.local/checkout/${encodeURIComponent(paymentId)}`,
          expires_at: null
        }
      });
    }

    if (escrow.status !== "CREATED") {
      return jsonResponse(409, errorPayload("ESCROW_NOT_ACTIONABLE", "Escrow not actionable", { status: escrow.status }));
    }

    const session = await adapter.createCheckoutSession({
      escrowId: escrow.escrow_id,
      amountMinor: escrow.amount_gross_minor,
      currency: escrow.currency
    });

    const updated = await setEscrowPayment({
      escrowId: escrow.escrow_id,
      actorAgentId: agentId,
      provider: adapter.provider,
      paymentId: session.paymentId
    });

    // Claim orphaned PENDING_RETRY payment webhooks that arrived before psp_payment_id was persisted,
    // then replay them so the escrow can transition without waiting for a re-delivery.
    let claimed = 0;
    try {
      claimed = await claimOrphanedPspWebhookEvents({ escrowId: escrow.escrow_id, paymentId: session.paymentId });
      if (claimed > 0) {
        await replayPendingEscrowEvents({ escrowId: escrow.escrow_id, adapter });
      }
    } catch (replayError) {
      console.info("escrow.pay.replay_failed", {
        escrowId: escrow.escrow_id,
        error: replayError?.message || String(replayError)
      });
    }

    // If we replayed anything, refresh to avoid returning a stale status.
    let finalStatus = updated.status;
    if (claimed > 0) {
      try {
        const refreshed = await getEscrowById(String(updated.escrow_id));
        if (refreshed?.status) finalStatus = refreshed.status;
      } catch (refreshError) {
        // best-effort only.
      }
    }

    if (ctx) {
      ctx.body = {
        escrow_id: updated.escrow_id,
        status: finalStatus,
        psp_payment_id: updated.psp_payment_id
      };
    }

    return jsonResponse(200, {
      escrow_id: updated.escrow_id,
      status: finalStatus,
      psp: {
        payment_id: session.paymentId,
        checkout_url: session.checkoutUrl,
        expires_at: session.expiresAt
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.pay" });
