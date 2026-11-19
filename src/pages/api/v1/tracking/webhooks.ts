import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { recordTrackingEvent } from "../../../../server/services/protected-checkout";
import { publishSseEvent } from "../../../../server/sse/store";
import { createTrackingAdapter, getTrackingWebhookSecret } from "../../../../server/tracking";

const MAX_WEBHOOK_BYTES = 16 * 1024;

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  // Keep the audit payload small: the event id and status, never the raw body.
  if (ctx) {
    ctx.auditEvent = "tracking.webhook_received";
    ctx.body = {
      event_id: (req.body && typeof req.body === "object" ? (req.body as any).id : null) || null,
      status: (req.body && typeof req.body === "object" ? (req.body as any).status : null) || null
    };
  }

  const secret = getTrackingWebhookSecret();
  if (!secret) {
    return jsonResponse(409, errorPayload("TRACKING_NOT_CONFIGURED", "Tracking webhook is not configured"));
  }

  const canonicalBody = ctx?.canonicalBody || "";
  if (Buffer.byteLength(canonicalBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return jsonResponse(413, errorPayload("PAYLOAD_TOO_LARGE", "Webhook payload too large"));
  }

  const adapter = createTrackingAdapter();
  const verified = adapter.verifyWebhookSignature({ canonicalBody, headers: req.headers, secret });
  if (!verified.ok) {
    return jsonResponse(401, errorPayload("TRACKING_WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature"));
  }

  let event;
  try {
    event = adapter.parseWebhookEvent(req.body || {});
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  try {
    const result = await recordTrackingEvent({
      carrier: event.carrier,
      trackingNumber: event.tracking_number,
      providerEventId: event.id,
      status: event.status,
      occurredAt: event.occurred_at,
      location: event.location
    });

    if (ctx) {
      ctx.auditEntityType = "escrow";
      ctx.auditEntityId = String(result.escrow_id);
      ctx.body = {
        event_id: event.id,
        status: event.status,
        escrow_id: result.escrow_id,
        escrow_status: result.escrow_status,
        duplicate: result.duplicate,
        window_started: result.window_started
      };
    }

    if (result.window_started) {
      await Promise.all(
        [result.buyer_agent_id, result.seller_agent_id].filter(Boolean).map(async (audienceId) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "escrow.state_changed",
              actor: { type: "system", id: "tracking" },
              entity: { type: "escrow", id: result.escrow_id },
              payload: {
                status: result.escrow_status,
                transition: "carrier_delivered",
                inspection_ends_at: result.inspection_ends_at
              }
            });
          } catch (error) {
            console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
          }
        })
      );
    }

    return jsonResponse(200, { ok: true, ...(result.duplicate ? { duplicate: true } : {}) });
  } catch (error) {
    if (error?.code === "SHIPMENT_NOT_FOUND") {
      // Acknowledge events for parcels we do not track so the provider stops retrying.
      return jsonResponse(200, { ok: true, ignored: true });
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "tracking.webhooks", enableIdempotency: false });
