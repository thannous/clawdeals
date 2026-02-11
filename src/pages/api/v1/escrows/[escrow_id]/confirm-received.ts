import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getPspConfig } from "../../../../../server/services/psp-config";
import { createPspAdapter } from "../../../../../server/psp";
import { getEscrowById, markEscrowConfirmed, setEscrowReleasePending } from "../../../../../server/services/escrows";
import { upsertPendingApproval } from "../../../../../server/services/approvals";
import { claimOrphanedPspWebhookEvents } from "../../../../../server/services/psp-webhook-events";
import { replayPendingEscrowEvents } from "../../../../../server/services/psp-webhook-replay";
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

async function publishEscrowStateChanged({ escrow, actor, transition }: any) {
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
          payload: { status: escrow.status, transition }
        });
      } catch (error) {
        console.info("sse.publish_failed", { type: "escrow.state_changed", error: error?.message || String(error) });
      }
    })
  );
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

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const escrowId = resolveParam(req.query?.escrow_id);
  if (!isUuid(escrowId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "escrow_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "escrow.state_changed";
    ctx.auditEntityType = "escrow";
    ctx.auditEntityId = String(escrowId);
    ctx.body = { escrow_id: String(escrowId), action: "confirm-received" };
  }

  try {
    const config = await getPspConfig();
    if (!config) {
      return jsonResponse(409, errorPayload("PSP_NOT_CONFIGURED", "PSP not configured"));
    }

    const escrow = await getEscrowById(String(escrowId));
    if (!escrow || escrow.buyer_agent_id !== agentId) {
      return jsonResponse(404, errorPayload("ESCROW_NOT_FOUND", "Escrow not found"));
    }

    // TI-332: installation-scoped credentials must always request approval for payout release.
    if (ctx?.installationId) {
      const ownerId = ctx?.ownerId || null;
      if (!ownerId || !isUuid(ownerId)) {
        return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner context required"));
      }

      const approval = await upsertPendingApproval({
        ownerId,
        actionType: "escrow.confirm_received",
        actionRef: {
          escrow_id: escrow.escrow_id,
          tx_id: escrow.tx_id,
          buyer_agent_id: escrow.buyer_agent_id,
          seller_agent_id: escrow.seller_agent_id,
          installation_id: ctx.installationId
        },
        actionRefId: escrow.escrow_id,
        actionPayload: {
          escrow_id: escrow.escrow_id
        },
        createdByAgentId: agentId
      });

      if (ctx) {
        ctx.auditEvent = "escrow.confirm_received_requested";
        ctx.auditEntityType = "approval";
        ctx.auditEntityId = approval.approval_id;
        ctx.policy = {
          decision: "REQUIRES_APPROVAL",
          approval_id: approval.approval_id,
          policy_version: null
        };
        ctx.security = {
          ...(ctx.security || {}),
          installation_id: ctx.installationId,
          approval_id: approval.approval_id
        };
      }

      return jsonResponse(202, {
        status: "PENDING_APPROVAL",
        approval_id: approval.approval_id,
        escrow_id: escrow.escrow_id,
        message: "Payout release pending approval"
      });
    }

    const paymentId = escrow.psp_payment_id ? String(escrow.psp_payment_id) : null;
    if (!paymentId) {
      return jsonResponse(409, errorPayload("ESCROW_NOT_READY", "Escrow payment not initialized"));
    }

    const confirmed = await markEscrowConfirmed({ escrowId: escrow.escrow_id, actorAgentId: agentId });

    const adapter = createPspAdapter({ provider: config.provider as any, mode: config.mode as any });
    const release = await adapter.release({
      escrowId: escrow.escrow_id,
      paymentId,
      amountMinor: escrow.amount_gross_minor,
      currency: escrow.currency
    });

    const pending = await setEscrowReleasePending({ escrowId: escrow.escrow_id, payoutId: release.payoutId });

    // Claim orphaned PENDING_RETRY payout webhooks that arrived before psp_payout_id was persisted,
    // then replay them so the escrow transitions to RELEASED without waiting for a re-delivery.
    try {
      const claimed = await claimOrphanedPspWebhookEvents({ escrowId: escrow.escrow_id, payoutId: release.payoutId });
      if (claimed > 0) {
        await replayPendingEscrowEvents({ escrowId: escrow.escrow_id, adapter });
      }
    } catch (replayError) {
      console.info("escrow.confirm_received.replay_failed", { escrowId: escrow.escrow_id, error: replayError?.message || String(replayError) });
    }

    if (ctx) {
      ctx.body = {
        escrow_id: pending.escrow_id,
        status: pending.status,
        confirmed_at: confirmed.confirmed_at || null,
        psp_payout_id: pending.psp_payout_id || null
      };
    }

    await publishEscrowStateChanged({
      escrow: pending,
      actor: { type: "agent", id: agentId },
      transition: "confirm_received"
    });

    return jsonResponse(200, {
      escrow_id: pending.escrow_id,
      status: pending.status,
      confirmed_at: confirmed.confirmed_at,
      psp: {
        payout_id: release.payoutId
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "escrows.confirm_received" });
