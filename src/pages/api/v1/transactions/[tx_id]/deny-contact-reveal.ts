import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getTransaction } from "../../../../../server/services/transactions";

function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function param(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isOpsOwner(ctx, env = process.env) {
  const opsOwnerId = env.CONSOLE_OPS_OWNER_ID || "00000000-0000-4000-a000-000000000000";
  return ctx?.actor?.type === "owner" && ctx?.ownerId === opsOwnerId;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (!header(req, "idempotency-key")) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }
  if (!isOpsOwner(ctx)) {
    return jsonResponse(403, errorPayload("PERMISSION_DENIED", "Permission denied"));
  }

  const txId = param(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }
  if (ctx) ctx.body = { tx_id: txId, action: "deny_contact_reveal_legacy" };

  try {
    const tx = await getTransaction(String(txId));
    if (!tx) return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));

    if (tx.contact_reveal_state === "DENIED") {
      if (ctx) ctx.auditEvent = "contact_reveal.status_viewed";
      return jsonResponse(200, {
        tx_id: tx.tx_id,
        contact_reveal_state: tx.contact_reveal_state,
        denied_at: tx.updated_at
      });
    }

    return jsonResponse(
      409,
      errorPayload(
        "BILATERAL_CONSENT_REQUIRED",
        "Each transaction owner must resolve their own contact reveal consent"
      )
    );
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "contact_reveal.resolve" });
