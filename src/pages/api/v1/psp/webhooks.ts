import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getPspConfig } from "../../../../server/services/psp-config";
import { resolveSecretRef } from "../../../../server/config/secrets";
import { createPspAdapter } from "../../../../server/psp";
import { insertPspWebhookEvent, updatePspWebhookEventStatus } from "../../../../server/services/psp-webhook-events";
import {
  getEscrowByPaymentId,
  getEscrowByPayoutId,
  getEscrowByRefundId
} from "../../../../server/services/escrows";
import { applyWebhookEvent, classifyApplyError, replayPendingEscrowEvents } from "../../../../server/services/psp-webhook-replay";
import { publishSseEvent } from "../../../../server/sse/store";
import { safeAuditLog } from "../../../../server/audit/singleton";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

async function publishEscrowStateChanged(escrow: any, actor: any, type: string) {
  const audienceIds = [escrow?.buyer_agent_id, escrow?.seller_agent_id].filter((v) => typeof v === "string" && v);
  await Promise.all(
    audienceIds.map(async (audienceId) => {
      try {
        await publishSseEvent({
          audienceType: "agent",
          audienceId,
          type: "escrow.state_changed",
          actor: actor || { type: "system", id: "psp" },
          entity: { type: "escrow", id: escrow.escrow_id },
          payload: {
            status: escrow.status,
            transition: type
          }
        });
      } catch (error) {
        console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
      }
    })
  );
}

async function safeAuditWebhookApplied(ctx: any, { eventId, eventType, escrowId, outcome, error }: any) {
  try {
    await safeAuditLog({
      occurredAt: new Date().toISOString(),
      actor: ctx?.actor || null,
      auth: {
        agent_id: ctx?.agentId || null,
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
        event: "psp.webhook_applied",
        entity_type: escrowId ? "escrow" : null,
        entity_id: escrowId || null
      },
      security: ctx?.security || {},
      policy: ctx?.policy || {},
      payload: {
        psp_event_id: eventId,
        type: eventType,
        escrow_id: escrowId || null,
        error: error || null
      },
      rateLimit: ctx?.rateLimit || null,
      idempotency: ctx?.idempotency || null,
      outcome: outcome || "UNKNOWN"
    });
  } catch (e) {
    console.info("audit.write_failed", { event: "psp.webhook_applied", error: e?.message || String(e) });
  }
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  // Keep audit payload safe: do not store raw webhook bodies.
  if (ctx) {
    ctx.auditEvent = "psp.webhook_received";
    ctx.body = {
      event_id: (req.body && typeof req.body === "object" ? (req.body as any).id : null) || null,
      type: (req.body && typeof req.body === "object" ? (req.body as any).type : null) || null
    };
  }

  const config = await getPspConfig();
  if (!config) {
    return jsonResponse(409, errorPayload("PSP_NOT_CONFIGURED", "PSP not configured"));
  }

  const canonicalBody = ctx?.canonicalBody || "";
  if (byteLength(canonicalBody) > MAX_WEBHOOK_BYTES) {
    return jsonResponse(413, errorPayload("PAYLOAD_TOO_LARGE", "Webhook payload too large"));
  }

  let secret: string;
  try {
    secret = resolveSecretRef(config.webhook_secret_ref);
  } catch (error) {
    console.info("psp.webhook_misconfigured", { reason: error?.message || String(error) });
    return jsonResponse(409, errorPayload("PSP_WEBHOOK_MISCONFIGURED", "PSP webhook misconfigured"));
  }

  let adapter: any;
  try {
    adapter = createPspAdapter({ provider: config.provider as any, mode: config.mode as any });
  } catch (error) {
    console.info("psp.webhook_misconfigured", { reason: error?.message || String(error) });
    return jsonResponse(
      error.status || 409,
      errorPayload(error.code || "PSP_WEBHOOK_MISCONFIGURED", error.message || "PSP webhook misconfigured", error.details)
    );
  }

  const verified = adapter.verifyWebhookSignature({
    canonicalBody,
    headers: req.headers,
    secret
  });
  if (!verified.ok) {
    return jsonResponse(401, errorPayload("PSP_WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature"));
  }

  let event: any;
  try {
    event = adapter.parseWebhookEvent(req.body || {});
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  let escrowIdHint: string | null = null;
  try {
    if (event.type === "payment.succeeded") {
      const existing = await getEscrowByPaymentId(event.data.payment_id);
      escrowIdHint = existing?.escrow_id || null;
    } else if (event.type === "payout.succeeded") {
      const existing = await getEscrowByPayoutId(event.data.payout_id);
      escrowIdHint = existing?.escrow_id || null;
    } else if (event.type === "refund.succeeded") {
      const existing = await getEscrowByRefundId(event.data.refund_id);
      escrowIdHint = existing?.escrow_id || null;
    }
  } catch (error) {
    // best-effort only.
  }

  const inserted = await insertPspWebhookEvent({
    provider: adapter.provider,
    eventId: event.id,
    type: event.type,
    escrowId: escrowIdHint,
    externalAccountId: event.type === "account.updated" ? event.data.external_account_id : null,
    payload: req.body || {}
  });

  if (inserted.duplicate) {
    return jsonResponse(200, { ok: true, duplicate: true });
  }

  try {
    const result = await applyWebhookEvent(event);

    const finalEscrowId = result.escrow?.escrow_id || escrowIdHint || null;
    await updatePspWebhookEventStatus({
      id: inserted.row.id,
      status: "APPLIED",
      error: null,
      escrowId: finalEscrowId,
      appliedAt: new Date().toISOString()
    });

    await safeAuditWebhookApplied(ctx, {
      eventId: event.id,
      eventType: event.type,
      escrowId: finalEscrowId,
      outcome: "SUCCESS",
      error: null
    });

    if (
      result.escrow &&
      (event.type === "payment.succeeded" || event.type === "payout.succeeded" || event.type === "refund.succeeded")
    ) {
      await publishEscrowStateChanged(result.escrow, { type: "system", id: "psp" }, event.type);
      await replayPendingEscrowEvents({ escrowId: result.escrow.escrow_id, adapter });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    const nextStatus = error?.code === "PSP_ACCOUNT_NOT_FOUND" ? "PENDING_RETRY" : classifyApplyError(error);

    await updatePspWebhookEventStatus({
      id: inserted.row.id,
      status: nextStatus,
      error: error?.message || String(error),
      escrowId: escrowIdHint
    });

    await safeAuditWebhookApplied(ctx, {
      eventId: event.id,
      eventType: event.type,
      escrowId: escrowIdHint,
      outcome: nextStatus === "FAILED" ? "FAILURE" : "SUCCESS",
      error: error?.message || String(error)
    });

    // Always ACK to PSP (avoid repeated retries in v0).
    return jsonResponse(200, { ok: true, deferred: nextStatus === "PENDING_RETRY" });
  }
}

export default withApiMiddlewares(handler, { enableIdempotency: false });
