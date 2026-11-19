import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { isUuid } from "../../../../../../server/utils/validators";
import { getOpsConsoleOwnerId } from "../../../../../../server/config/ops";
import { getDisputeById } from "../../../../../../server/services/disputes";
import { getEscrow, getEvidenceItemReadUrl } from "../../../../../../server/services/evidence";
import { resolveEscrowParties } from "../../../../../../server/services/protected-checkout";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Authorizes the dispute party or reviewer before redirecting to a short-lived
// URL for the private evidence object.
export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const disputeId = resolveParam(req.query?.dispute_id);
  const evidenceItemId = resolveParam(req.query?.evidence_item_id);
  if (!isUuid(disputeId) || !isUuid(evidenceItemId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "dispute_id and evidence_item_id must be UUIDs"));
  }

  if (ctx) {
    ctx.auditEvent = "evidence.file_read";
    ctx.auditEntityType = "dispute";
    ctx.auditEntityId = String(disputeId);
    ctx.body = { dispute_id: String(disputeId), evidence_item_id: String(evidenceItemId) };
  }

  try {
    const dispute = await getDisputeById(String(disputeId));
    const escrow = dispute ? await getEscrow(dispute.escrow_id) : null;
    if (!dispute || !escrow) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
    }

    const ownerId = ctx?.actor?.type === "owner" ? ctx?.ownerId || null : null;
    const isReviewer = Boolean(ownerId) && ownerId === getOpsConsoleOwnerId();
    if (!isReviewer) {
      const parties = await resolveEscrowParties({ escrow, agentId: ctx?.agentId || null, ownerId });
      if (!parties.buyer && !parties.seller) {
        // Anti-enumeration: hide existence.
        return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
      }
    }

    const readUrl = await getEvidenceItemReadUrl({
      disputeId: String(disputeId),
      evidenceItemId: String(evidenceItemId)
    });
    if (!readUrl) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
    }

    res.statusCode = 302;
    res.setHeader("Location", readUrl.url);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.end();
    return null;
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "evidence.read", enableIdempotency: false });
