import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { getListing } from "../../../../../server/services/listings";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { isFeatureEnabled } from "../../../../../server/config/feature-flags";
import { CONTACT_REVEAL_MIN_TRUST_SCORE } from "../../../../../server/config/transactions";
import {
  getContactRevealApprovalByTxId,
  getTransaction,
  requestContactReveal
} from "../../../../../server/services/transactions";
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

function isHardBlocked(flags: any[] = []) {
  return flags.some((f) => f === "suspended" || f === "banned");
}

function isRestrictedForAutoApprove(flags: any[] = []) {
  return flags.some((f) => f === "under_review" || f === "restricted" || f === "suspended" || f === "quarantined");
}

function isParty(tx, agentId) {
  return tx?.buyer_agent_id === agentId || tx?.seller_agent_id === agentId;
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

  const txId = resolveParam(req.query?.tx_id);
  if (!isUuid(txId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "tx_id must be a UUID"));
  }

  if (ctx) {
    ctx.body = { tx_id: txId, action: "request_contact_reveal" };
  }

  try {
    const trustContext = await resolveTrustContext({ ctx, actionType: "approval" });
    const trustScore = Number.isFinite(trustContext?.trust_score) ? trustContext.trust_score : 0;
    const trustFlags = Array.isArray(trustContext?.trust_flags) ? trustContext.trust_flags : [];

    if (isHardBlocked(trustFlags)) {
      if (ctx) {
        ctx.auditEvent = "contact_reveal.denied_trust";
        ctx.outcome = { type: "BLOCKED", reason: "trust" };
      }
      return jsonResponse(403, errorPayload("TRUST_RESTRICTED", "Agent trust restrictions prevent contact reveal"));
    }

    const tx = await getTransaction(String(txId));
    if (!tx || !isParty(tx, agentId)) {
      // Anti-enumeration.
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    if (tx.contact_reveal_state === "APPROVED") {
      if (ctx) {
        ctx.auditEvent = "contact_reveal.requested";
      }
      return jsonResponse(200, {
        tx_id: tx.tx_id,
        status: tx.status,
        contact_reveal_state: tx.contact_reveal_state,
        contact_revealed_at: tx.contact_revealed_at,
        message: "Contact reveal already approved"
      });
    }

    if (tx.contact_reveal_state === "REQUESTED") {
      const approval = await getContactRevealApprovalByTxId(tx.tx_id);
      if (!approval) {
        return jsonResponse(500, errorPayload("ERROR", "Missing contact reveal approval"));
      }
      if (ctx) {
        ctx.auditEvent = "contact_reveal.requested";
        ctx.policy = {
          decision: POLICY_DECISION.REQUIRES_APPROVAL,
          policy_version: null,
          approval_id: approval.approval_id
        };
      }
      return jsonResponse(202, {
        tx_id: tx.tx_id,
        contact_reveal_state: tx.contact_reveal_state,
        approval_id: approval.approval_id,
        message: "Contact reveal request pending approval"
      });
    }

    // Safe default: contact reveal is only actionable on ACCEPTED.
    if (tx.status !== "ACCEPTED") {
      return jsonResponse(
        409,
        errorPayload("TX_NOT_ACCEPTED", "Transaction not accepted", {
          status: tx.status
        })
      );
    }

    const listing = await getListing(tx.listing_id);
    if (!listing) {
      return jsonResponse(404, errorPayload("TX_NOT_FOUND", "Transaction not found"));
    }

    const ownerId = listing.owner_id || null;
    if (!ownerId || !isUuid(String(ownerId))) {
      return jsonResponse(500, errorPayload("ERROR", "Listing owner missing"));
    }

    const policyRecord = await getPolicyOrDefault(String(ownerId));
    const policyDecision = evaluatePolicyAction({
      policy: policyRecord?.policy_json || {},
      action: "contact_reveal"
    });

    const featureEnabled = isFeatureEnabled("contact_reveal_auto_approve");
    const restrictedForAuto = isRestrictedForAutoApprove(trustFlags);

    const autoApprove =
      featureEnabled &&
      policyDecision.decision === POLICY_DECISION.AUTO_APPROVED &&
      !restrictedForAuto &&
      trustScore >= CONTACT_REVEAL_MIN_TRUST_SCORE &&
      tx.contact_reveal_state !== "DENIED";

    if (ctx) {
      ctx.policy = {
        decision: policyDecision.decision,
        policy_version: policyDecision.policy_version,
        approval_id: null
      };
    }

    const result = await requestContactReveal({
      txId: tx.tx_id,
      actorAgentId: agentId,
      autoApprove
    });

    const audienceIds = uniqueStrings([tx.buyer_agent_id, tx.seller_agent_id]);

    if (result.contact_reveal_state === "APPROVED") {
      if (ctx) {
        ctx.auditEvent = "contact_reveal.auto_approved";
      }
      await Promise.all(
        audienceIds.map(async (audienceId) => {
          try {
            await publishSseEvent({
              audienceType: "agent",
              audienceId,
              type: "contact_reveal.approved",
              actor: { type: "agent", id: agentId },
              entity: { type: "transaction", id: tx.tx_id },
              payload: {
                listing_id: tx.listing_id,
                contact_reveal_state: "APPROVED"
              }
            });
          } catch (error) {
            console.info("sse.publish_failed", { type: "contact_reveal.approved", error: error?.message || String(error) });
          }
        })
      );

      return jsonResponse(200, {
        tx_id: result.tx_id,
        status: result.tx_status || result.status || "CONTACT_REVEALED",
        contact_reveal_state: result.contact_reveal_state,
        contact_revealed_at: result.contact_revealed_at,
        message: "Contact reveal approved automatically"
      });
    }

    if (ctx) {
      ctx.auditEvent = "contact_reveal.requested";
      ctx.policy = {
        decision: policyDecision.decision,
        policy_version: policyDecision.policy_version,
        approval_id: result.approval_id || null
      };
      if (ctx.body && typeof ctx.body === "object") {
        Object.assign(ctx.body, {
          listing_id: tx.listing_id,
          approval_id: result.approval_id || null
        });
      }
    }

    await Promise.all(
      audienceIds.map(async (audienceId) => {
        try {
          await publishSseEvent({
            audienceType: "agent",
            audienceId,
            type: "contact_reveal.requested",
            actor: { type: "agent", id: agentId },
            entity: { type: "transaction", id: tx.tx_id },
            payload: {
              listing_id: tx.listing_id,
              contact_reveal_state: "REQUESTED",
              approval_id: result.approval_id || null
            }
          });
        } catch (error) {
          console.info("sse.publish_failed", { type: "contact_reveal.requested", error: error?.message || String(error) });
        }
      })
    );

    return jsonResponse(202, {
      tx_id: result.tx_id,
      contact_reveal_state: result.contact_reveal_state || "REQUESTED",
      approval_id: result.approval_id,
      message: "Contact reveal request pending approval"
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "contact_reveal.request"
});
