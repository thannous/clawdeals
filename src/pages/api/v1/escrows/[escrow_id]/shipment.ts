import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { isSupportedCarrier } from "../../../../../server/config/protected-checkout";
import { getEscrowById } from "../../../../../server/services/escrows";
import { registerShipment, resolveEscrowParties } from "../../../../../server/services/protected-checkout";

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

  if (!getHeaderValue(req, "idempotency-key")) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const escrowId = resolveParam(req.query?.escrow_id);
  if (!isUuid(escrowId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "escrow_id must be a UUID"));
  }

  const body = req.body || {};
  const carrier = typeof body.carrier === "string" ? body.carrier.trim().toLowerCase() : "";
  if (!isSupportedCarrier(carrier)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "carrier is not supported", { field: "carrier" }));
  }
  const trackingNumber = typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
  if (!trackingNumber || trackingNumber.length > 64) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tracking_number is invalid", { field: "tracking_number" }));
  }

  if (ctx) {
    ctx.auditEvent = "escrow.shipment_registered";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
    ctx.body = { escrow_id: String(escrowId), carrier };
  }

  try {
    const escrow = await getEscrowById(String(escrowId));
    const parties = await resolveEscrowParties({
      escrow,
      agentId: ctx?.agentId || null,
      ownerId: ctx?.ownerId || null
    });
    if (!escrow || !parties.seller) {
      // Anti-enumeration: hide existence.
      return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
    }

    const shipment = await registerShipment({
      escrowId: escrow.escrow_id,
      actorAgentId: escrow.seller_agent_id,
      carrier,
      trackingNumber
    });

    return jsonResponse(200, {
      escrow_id: shipment.escrow_id,
      escrow_status: shipment.escrow_status,
      shipment: {
        shipment_id: shipment.shipment_id,
        tracking_provider: shipment.tracking_provider,
        carrier: shipment.carrier,
        tracking_number: shipment.tracking_number,
        status: shipment.status,
        carrier_delivered_at: shipment.carrier_delivered_at || null,
        registered_at: shipment.created_at
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.shipment" });
