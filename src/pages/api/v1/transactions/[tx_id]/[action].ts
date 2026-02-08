import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getPspConfig } from "../../../../../server/services/psp-config";
import { getPspAccountForOwner } from "../../../../../server/services/psp-accounts";
import { getTransaction } from "../../../../../server/services/transactions";
import { getAgentById } from "../../../../../server/services/agents";
import { createEscrow } from "../../../../../server/services/escrows";
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

function uniqueStrings(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) set.add(value);
  });
  return Array.from(set);
}

async function publishEscrowStateChanged({ escrow, actor }: any) {
  const audienceIds = uniqueStrings([escrow?.buyer_agent_id, escrow?.seller_agent_id]);
  await Promise.all(
    audienceIds.map(async (audienceId) => {
      try {
        await publishSseEvent({
          audienceType: "agent",
          audienceId,
          type: "escrow.state_changed",
          actor,
          entity: { type: "escrow", id: escrow.escrow_id },
          payload: { status: escrow.status, transition: "created" }
        });
      } catch (error) {
        console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
      }
    })
  );
}

export async function handler(req, res, ctx) {
  const rawAction = resolveParam(req.query?.action);
  const action = rawAction ? String(rawAction) : "";

  if (action !== "escrow:create") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown transaction action"));
  }

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

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "escrow.create";
    ctx.body = { tx_id: String(txId), action: "escrow:create" };
  }

  try {
    const config = await getPspConfig();
    if (!config) {
      return jsonResponse(409, errorPayload("PSP_NOT_CONFIGURED", "PSP not configured"));
    }

    const feeBps = Number(config.platform_fee_bps_default || 0);

    // KYC gating: only in production mode.
    if (String(config.mode) === "production") {
      const tx = await getTransaction(String(txId));
      if (!tx) {
        return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
      }
      // Anti-enumeration: only the buyer can create an escrow.
      if (tx.buyer_agent_id !== agentId) {
        return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
      }
      const sellerAgentId = tx.seller_agent_id;
      const sellerAgent = sellerAgentId ? await getAgentById(sellerAgentId) : null;
      const sellerOwnerId = sellerAgent?.owner_id || null;
      if (!sellerOwnerId) {
        return jsonResponse(403, errorPayload("SELLER_KYC_REQUIRED", "Seller KYC required"));
      }
      const sellerPsp = await getPspAccountForOwner(sellerOwnerId);
      if (!sellerPsp || sellerPsp.kyc_status !== "VERIFIED") {
        return jsonResponse(403, errorPayload("SELLER_KYC_REQUIRED", "Seller KYC required"));
      }
    }

    const escrow = await createEscrow({ txId: String(txId), actorAgentId: agentId, feeBps });

    if (ctx) {
      ctx.auditEntityType = "escrow";
      ctx.auditEntityId = escrow.escrow_id;
      ctx.body = {
        tx_id: String(txId),
        escrow_id: escrow.escrow_id,
        status: escrow.status,
        amount_gross_minor: escrow.amount_gross_minor,
        currency: escrow.currency,
        platform_fee_bps: escrow.platform_fee_bps
      };
    }

    await publishEscrowStateChanged({
      escrow,
      actor: { type: "agent", id: agentId }
    });

    return jsonResponse(201, {
      escrow_id: escrow.escrow_id,
      tx_id: escrow.tx_id,
      status: escrow.status,
      currency: escrow.currency,
      amount_gross_minor: escrow.amount_gross_minor,
      platform_fee_bps: escrow.platform_fee_bps,
      amount_platform_fee_minor: escrow.amount_platform_fee_minor,
      amount_net_minor: escrow.amount_net_minor
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.create" });
