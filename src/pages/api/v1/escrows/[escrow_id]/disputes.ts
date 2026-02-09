import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { redactEmailsAndPhones } from "../../../../../server/utils/free-text-redaction";
import { getAgentById } from "../../../../../server/services/agents";
import { getEscrowById } from "../../../../../server/services/escrows";
import { openDispute } from "../../../../../server/services/disputes";

const ALLOWED_REASON_CODES = new Set([
  "item_not_received",
  "not_as_described",
  "fraud_suspected",
  "other"
]);

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeReasonCode(value: any) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

function normalizeNotesRedacted(value: any) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const redacted = redactEmailsAndPhones(trimmed);
  const truncated = redacted.text.slice(0, 500);
  return truncated.trim() ? truncated : null;
}

async function resolveActorAgentId({
  actorAgentId,
  actorOwnerId,
  escrow
}: {
  actorAgentId: string | null;
  actorOwnerId: string | null;
  escrow: any;
}) {
  if (!escrow) return null;
  if (actorAgentId) return actorAgentId;
  if (!actorOwnerId) return null;

  // Owner acting on behalf of their agent.
  const [buyerAgent, sellerAgent] = await Promise.all([
    escrow.buyer_agent_id ? getAgentById(escrow.buyer_agent_id) : null,
    escrow.seller_agent_id ? getAgentById(escrow.seller_agent_id) : null
  ]);

  if (buyerAgent?.owner_id && buyerAgent.owner_id === actorOwnerId) {
    return escrow.buyer_agent_id;
  }
  if (sellerAgent?.owner_id && sellerAgent.owner_id === actorOwnerId) {
    return escrow.seller_agent_id;
  }

  return null;
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

  const escrowId = resolveParam(req.query?.escrow_id);
  if (!isUuid(escrowId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "escrow_id must be a UUID"));
  }

  const escrow = await getEscrowById(String(escrowId));
  if (!escrow) {
    return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
  }

  const actorAgentId = await resolveActorAgentId({
    actorAgentId: ctx?.agentId || null,
    actorOwnerId: ctx?.ownerId || null,
    escrow
  });
  if (!actorAgentId) {
    // Anti-enumeration: hide existence.
    return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
  }

  const body = req.body || {};
  const reasonCode = normalizeReasonCode(body.reason_code);
  if (!reasonCode || !ALLOWED_REASON_CODES.has(reasonCode)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason_code is invalid"));
  }

  const openedNotesRedacted = normalizeNotesRedacted(body.notes);

  if (ctx) {
    ctx.auditEvent = "dispute.opened";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
    ctx.body = {
      escrow_id: String(escrowId),
      reason_code: reasonCode,
      opened_notes_redacted: openedNotesRedacted
    };
  }

  try {
    const result = await openDispute({
      escrowId: String(escrowId),
      actorAgentId: String(actorAgentId),
      reasonCode,
      openedNotesRedacted
    });

    if (ctx) {
      ctx.auditEntityType = "dispute";
      ctx.auditEntityId = String(result.dispute_id);
      ctx.body = {
        dispute_id: result.dispute_id,
        escrow_id: result.escrow_id,
        status: result.status,
        opened_by: result.opened_by,
        reason_code: result.reason_code,
        opened_at: result.opened_at,
        escrow_status: result.escrow_status,
        opened_notes_redacted: openedNotesRedacted
      };
    }

    return jsonResponse(201, {
      dispute_id: result.dispute_id,
      escrow_id: result.escrow_id,
      status: result.status,
      opened_by: result.opened_by,
      reason_code: result.reason_code,
      opened_at: result.opened_at,
      escrow_status: result.escrow_status
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "disputes.open" });

