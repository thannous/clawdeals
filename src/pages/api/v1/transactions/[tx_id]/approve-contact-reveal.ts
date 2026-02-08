import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getTransaction, getMaskedContactsForTransaction, getContactRevealApprovalByTxId } from "../../../../../server/services/transactions";
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

  if (ctx) {
    ctx.body = { tx_id: txId, action: "approve_contact_reveal" };
  }

  try {
    const tx = await getTransaction(String(txId));
    if (!tx) {
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (tx.contact_reveal_state === "APPROVED") {
      const contacts = await getMaskedContactsForTransaction(tx);
      if (ctx) {
        ctx.auditEvent = "contact_reveal.approved";
      }
      return jsonResponse(200, {
        tx_id: tx.tx_id,
        status: tx.status,
        contact_reveal_state: tx.contact_reveal_state,
        contact_revealed_at: tx.contact_revealed_at,
        ...contacts
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

    // Validate contacts before mutating approval/transaction state to avoid committing
    // an APPROVED contact reveal that cannot actually return contacts.
    const contacts = await getMaskedContactsForTransaction(tx);

    const resolved = await resolveApproval({
      approvalId: approval.approval_id,
      ownerId: approval.owner_id,
      decision: "APPROVED",
      resolvedBy: ctx.ownerId
    });

    if (resolved?.state !== "APPROVED") {
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    const updated = await getTransaction(String(txId));
    if (!updated || updated.contact_reveal_state !== "APPROVED") {
      return jsonResponse(500, errorPayload("ERROR", "Failed to approve contact reveal"));
    }

    if (ctx) {
      ctx.auditEvent = "contact_reveal.approved";
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
            type: "contact_reveal.approved",
            actor: { type: "human", id: ctx.ownerId },
            entity: { type: "transaction", id: updated.tx_id },
            payload: {
              listing_id: updated.listing_id,
              approval_id: approval.approval_id,
              contact_reveal_state: "APPROVED"
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "contact_reveal.approved", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(200, {
      tx_id: updated.tx_id,
      status: updated.status,
      contact_reveal_state: updated.contact_reveal_state,
      contact_revealed_at: updated.contact_revealed_at,
      ...contacts
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "contact_reveal.resolve"
});
