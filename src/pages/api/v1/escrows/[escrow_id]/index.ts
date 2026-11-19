import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getEscrowById } from "../../../../../server/services/escrows";
import {
  buildPartyActions,
  loadProtectedCheckout,
  resolveEscrowParties
} from "../../../../../server/services/protected-checkout";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const escrowId = resolveParam(req.query?.escrow_id);
  if (!isUuid(escrowId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "escrow_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "escrow.read";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
  }

  try {
    const escrow = await getEscrowById(String(escrowId));
    const parties = await resolveEscrowParties({
      escrow,
      agentId: ctx?.agentId || null,
      ownerId: ctx?.ownerId || null
    });
    if (!escrow || (!parties.buyer && !parties.seller)) {
      // Anti-enumeration: hide existence.
      return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
    }

    const view = await loadProtectedCheckout(escrow);
    return jsonResponse(
      200,
      {
        ...view,
        viewer_roles: [...(parties.buyer ? ["BUYER"] : []), ...(parties.seller ? ["SELLER"] : [])],
        actions: buildPartyActions(view, parties)
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.read", enableIdempotency: false });
