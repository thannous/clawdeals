import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getTransaction, getContactRevealApprovalByTxId } from "../../../../../server/services/transactions";
import { resolveApproval } from "../../../../../server/services/approvals";
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

function resolveOpsOwnerId(env = process.env) {
  return env.CONSOLE_OPS_OWNER_ID || "00000000-0000-4000-a000-000000000000";
}

function isOpsOwner(ctx, env = process.env) {
  const opsOwnerId = resolveOpsOwnerId(env);
  return ctx?.actor?.type === "owner" && ctx?.ownerId && ctx.ownerId === opsOwnerId;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) set.add(value);
  });
  return Array.from(set);
}

function parseOptionalNote(value, field) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > 400) return { error: `${field} must be at most 400 characters` };
  return { value: trimmed };
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

  if (!isOpsOwner(ctx)) {
    return jsonResponse(403, errorPayload("PERMISSION_DENIED", "Permission denied"));
  }

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  const body = req.body || {};
  const reasonParsed = parseOptionalNote(body.reason, "reason");
  if (reasonParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", reasonParsed.error));
  }
  const notesParsed = parseOptionalNote(body.notes, "notes");
  if (notesParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", notesParsed.error));
  }

  if (ctx) {
    ctx.body = {
      tx_id: txId,
      action: "deny_contact_reveal",
      reason: reasonParsed.value,
      notes_len: notesParsed.value ? notesParsed.value.length : 0
    };
  }

  try {
    const tx = await getTransaction(String(txId));
    if (!tx) {
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (tx.contact_reveal_state === "APPROVED") {
      return jsonResponse(
        409,
        errorPayload("ALREADY_APPROVED", "Contact reveal already approved", {
          contact_reveal_state: tx.contact_reveal_state,
          status: tx.status
        })
      );
    }

    if (tx.contact_reveal_state === "DENIED") {
      if (ctx) {
        ctx.auditEvent = "contact_reveal.denied";
      }
      return jsonResponse(200, {
        tx_id: tx.tx_id,
        contact_reveal_state: tx.contact_reveal_state,
        denied_at: tx.updated_at,
        reason: reasonParsed.value,
        notes: notesParsed.value
      });
    }

    if (tx.contact_reveal_state !== "REQUESTED") {
      return jsonResponse(
        409,
        errorPayload("TX_NOT_REQUESTED", "Contact reveal not requested", {
          contact_reveal_state: tx.contact_reveal_state,
          status: tx.status
        })
      );
    }

    const approval = await getContactRevealApprovalByTxId(tx.tx_id);
    if (!approval) {
      return jsonResponse(500, errorPayload("ERROR", "Missing contact reveal approval"));
    }

    const resolved = await resolveApproval({
      approvalId: approval.approval_id,
      ownerId: approval.owner_id,
      decision: "DENIED",
      resolvedBy: ctx.ownerId
    });

    if (resolved?.state !== "DENIED") {
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    const updated = await getTransaction(String(txId));
    if (!updated || updated.contact_reveal_state !== "DENIED") {
      return jsonResponse(500, errorPayload("ERROR", "Failed to deny contact reveal"));
    }

    if (ctx) {
      ctx.auditEvent = "contact_reveal.denied";
      ctx.policy = {
        decision: "N_A",
        policy_version: null,
        approval_id: approval.approval_id
      };
      if (ctx.body && typeof ctx.body === "object") {
        Object.assign(ctx.body, {
          approval_id: approval.approval_id,
          listing_id: updated.listing_id,
          buyer_agent_id: updated.buyer_agent_id,
          seller_agent_id: updated.seller_agent_id
        });
      }
    }

    const audienceIds = uniqueStrings([updated.buyer_agent_id, updated.seller_agent_id]);
    await Promise.all(
      audienceIds.map(async (audienceId) => {
        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "contact_reveal.denied",
            actor: { type: "human", id: ctx.ownerId },
            entity: { type: "transaction", id: updated.tx_id },
            payload: {
              listing_id: updated.listing_id,
              approval_id: approval.approval_id,
              contact_reveal_state: "DENIED"
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "contact_reveal.denied", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(200, {
      tx_id: updated.tx_id,
      contact_reveal_state: updated.contact_reveal_state,
      denied_at: updated.updated_at,
      reason: reasonParsed.value,
      notes: notesParsed.value
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "contact_reveal.resolve"
});

