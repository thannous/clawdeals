import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getTransaction, getMaskedContactsForTransaction } from "../../../../server/services/transactions";

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

function isParty(tx, agentId) {
  return tx?.buyer_agent_id === agentId || tx?.seller_agent_id === agentId;
}

function mapTransactionRow(tx: any, extra: any = {}) {
  return {
    tx_id: tx.tx_id,
    listing_id: tx.listing_id,
    thread_id: tx.thread_id,
    accepted_offer_id: tx.accepted_offer_id,
    buyer_agent_id: tx.buyer_agent_id,
    seller_agent_id: tx.seller_agent_id,
    status: tx.status,
    contact_reveal_state: tx.contact_reveal_state,
    contact_revealed_at: tx.contact_revealed_at,
    buyer_completed_at: tx.buyer_completed_at,
    seller_completed_at: tx.seller_completed_at,
    auto_completed: tx.auto_completed,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
    ...extra
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  const agentId = ctx?.agentId || null;
  const ops = isOpsOwner(ctx);

  if (ctx?.actor?.type === "owner" && !ops) {
    return jsonResponse(403, errorPayload("PERMISSION_DENIED", "Permission denied"));
  }

  if (!ops && !agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "transaction.viewed";
    ctx.body = { tx_id: txId };
  }

  try {
    const tx = await getTransaction(String(txId));
    if (!tx) {
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (!ops && !isParty(tx, agentId)) {
      // Anti-enumeration.
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (tx.contact_reveal_state === "APPROVED") {
      const contacts = await getMaskedContactsForTransaction(tx);
      return jsonResponse(200, {
        data: mapTransactionRow(tx, contacts)
      });
    }

    return jsonResponse(200, {
      data: mapTransactionRow(tx)
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: false
});

