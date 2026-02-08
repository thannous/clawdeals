import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getAgentById } from "../../../../../server/services/agents";
import { getOpsConsoleOwnerId } from "../../../../../server/config/ops";
import {
  confirmEvidenceUpload,
  getDispute,
  getEscrow,
  initEvidenceUpload,
  isAllowedEvidenceContentType,
  isValidSha256Hex,
  listEvidenceBundle
} from "../../../../../server/services/evidence";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function resolveEvidenceRole({
  actorAgentId,
  actorOwnerId,
  escrow
}: {
  actorAgentId: string | null;
  actorOwnerId: string | null;
  escrow: any;
}): Promise<{ ok: true; submittedBy: "BUYER" | "SELLER" | "OPS" } | { ok: false }> {
  if (!escrow) return { ok: false };

  if (actorOwnerId && actorOwnerId === getOpsConsoleOwnerId()) {
    return { ok: true, submittedBy: "OPS" };
  }

  if (actorAgentId && actorAgentId === escrow.buyer_agent_id) {
    return { ok: true, submittedBy: "BUYER" };
  }
  if (actorAgentId && actorAgentId === escrow.seller_agent_id) {
    return { ok: true, submittedBy: "SELLER" };
  }

  // Owner acting on behalf of their agent.
  if (actorOwnerId) {
    const [buyerAgent, sellerAgent] = await Promise.all([
      escrow.buyer_agent_id ? getAgentById(escrow.buyer_agent_id) : null,
      escrow.seller_agent_id ? getAgentById(escrow.seller_agent_id) : null
    ]);

    if (buyerAgent?.owner_id && buyerAgent.owner_id === actorOwnerId) {
      return { ok: true, submittedBy: "BUYER" };
    }
    if (sellerAgent?.owner_id && sellerAgent.owner_id === actorOwnerId) {
      return { ok: true, submittedBy: "SELLER" };
    }
  }

  return { ok: false };
}

export async function handler(req, res, ctx) {
  const rawAction = resolveParam(req.query?.action);
  const action = rawAction ? String(rawAction) : "";

  const disputeId = resolveParam(req.query?.dispute_id);
  if (!isUuid(disputeId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "dispute_id must be a UUID"));
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const dispute = await getDispute(String(disputeId));
  if (!dispute) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  const escrow = await getEscrow(dispute.escrow_id);
  if (!escrow) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  const role = await resolveEvidenceRole({
    actorAgentId: ctx?.agentId || null,
    actorOwnerId: ctx?.ownerId || null,
    escrow
  });
  if (!role.ok) {
    // Anti-enumeration: hide existence.
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  if (action === "evidence" && req.method === "POST") {
    const idempotencyKey = getHeaderValue(req, "idempotency-key");
    if (!idempotencyKey) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }

    if (ctx) {
      ctx.auditEvent = "evidence.upload_initiated";
      ctx.auditEntityType = "dispute";
      ctx.auditEntityId = String(disputeId);
      ctx.body = { dispute_id: String(disputeId), action: "evidence" };
    }

    try {
      const result = await initEvidenceUpload({ disputeId: String(disputeId) });
      return jsonResponse(200, { upload: result.upload });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (action === "evidence:confirm" && req.method === "POST") {
    const idempotencyKey = getHeaderValue(req, "idempotency-key");
    if (!idempotencyKey) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }

    const body = req.body || {};
    const bucket = body.bucket;
    const key = body.key;
    const sha256 = body.sha256;
    const contentType = body.content_type;
    const bytes = body.bytes;

    if (!isValidSha256Hex(sha256)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sha256 is invalid"));
    }
    if (!isAllowedEvidenceContentType(contentType)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "content_type is invalid"));
    }
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "bytes is invalid"));
    }

    if (ctx) {
      ctx.auditEvent = "evidence.submitted";
      ctx.auditEntityType = "dispute";
      ctx.auditEntityId = String(disputeId);
      ctx.body = {
        dispute_id: String(disputeId),
        action: "evidence:confirm",
        bucket,
        key,
        sha256,
        content_type: contentType,
        bytes
      };
    }

    try {
      const result = await confirmEvidenceUpload({
        disputeId: String(disputeId),
        submittedBy: role.submittedBy,
        bucket,
        key,
        sha256,
        contentType,
        bytes
      });
      return jsonResponse(200, { evidence_item_id: result.item.evidence_item_id });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (action === "evidence" && req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "evidence.read";
      ctx.auditEntityType = "dispute";
      ctx.auditEntityId = String(disputeId);
      ctx.body = { dispute_id: String(disputeId), action: "evidence" };
    }

    try {
      const bundle = await listEvidenceBundle({ disputeId: String(disputeId), escrowId: escrow.escrow_id });
      return jsonResponse(200, {
        evidence_pack_id: bundle.evidence_pack_id,
        dispute_id: bundle.dispute_id,
        items: bundle.items,
        links: bundle.links,
        timeline: bundle.timeline
      });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (action === "evidence") {
    return methodNotAllowed(["GET", "POST"]);
  }
  if (action === "evidence:confirm") {
    return methodNotAllowed(["POST"]);
  }
  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown dispute action"));
}

export default withApiMiddlewares(handler);
