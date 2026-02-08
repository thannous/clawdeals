import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getOffer, getOpenOfferForThread, counterOffer } from "../../../../../server/services/offers";
import { getListing } from "../../../../../server/services/listings";
import { resolveTrustContext } from "../../../../../server/trustscore/context";
import { enforceAllowlist } from "../../../../../server/policy/enforce-allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../../server/services/policies";
import { createApproval } from "../../../../../server/services/approvals";
import { ALLOWED_CURRENCIES } from "../../../../../server/config/deals";
import {
  OFFERS_TTL_MIN_SECONDS,
  OFFERS_TTL_WINDOW_SECONDS
} from "../../../../../server/config/offers";
import crypto from "crypto";
import { canonicalJsonStringify } from "../../../../../server/utils/canonical-json";
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

function mapOfferResponse(offer: any) {
  return {
    offer_id: offer.offer_id,
    previous_offer_id: offer.previous_offer_id,
    thread_id: offer.thread_id,
    listing_id: offer.listing_id,
    buyer_agent_id: offer.buyer_agent_id,
    seller_agent_id: offer.seller_agent_id,
    amount: offer.amount,
    currency: offer.currency,
    expires_at: offer.expires_at,
    status: offer.status,
    created_at: offer.created_at
  };
}

function parseExpiresAt(raw, { now = new Date() } = {}) {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "expires_at is required" };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "expires_at must be an ISO8601 timestamp" };
  }

  const diffSeconds = (parsed.getTime() - now.getTime()) / 1000;
  if (!Number.isFinite(diffSeconds)) {
    return { ok: false, error: "expires_at is invalid" };
  }
  if (diffSeconds < OFFERS_TTL_MIN_SECONDS) {
    return {
      ok: false,
      error: `expires_at must be at least ${OFFERS_TTL_MIN_SECONDS} seconds in the future`
    };
  }
  if (diffSeconds > OFFERS_TTL_WINDOW_SECONDS) {
    return {
      ok: false,
      error: `expires_at must be at most ${OFFERS_TTL_WINDOW_SECONDS} seconds in the future`
    };
  }

  return { ok: true, value: parsed.toISOString() };
}

function isTrustRestricted(flags: any[] = []) {
  return flags.some((f) => f === "under_review" || f === "restricted" || f === "suspended");
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

  const rawId = resolveParam(req.query?.offer_id);
  const previousOfferId = rawId ? String(rawId) : "";
  if (!isUuid(previousOfferId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "offer_id must be a UUID"));
  }

  const body = req.body || {};

  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "amount must be an integer >= 0"));
  }

  const rawCurrency = body.currency;
  if (typeof rawCurrency !== "string" || !rawCurrency.trim()) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency is required"));
  }
  const currency = rawCurrency.trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.has(currency)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "currency is invalid"));
  }

  const expiresAtResult = parseExpiresAt(body.expires_at);
  if (!expiresAtResult.ok) {
    return jsonResponse(
      400,
      errorPayload(
        "INVALID_EXPIRES_AT",
        expiresAtResult.error,
        {
          min_seconds: OFFERS_TTL_MIN_SECONDS,
          max_seconds: OFFERS_TTL_WINDOW_SECONDS
        }
      )
    );
  }
  const expiresAt = expiresAtResult.value;

  if (ctx) {
    ctx.body = {
      previous_offer_id: previousOfferId,
      amount,
      currency,
      expires_at: expiresAt
    };
  }

  try {
    const offerPromise = getOffer(previousOfferId);
    const trustPromise = resolveTrustContext({ ctx, actionType: "offer.create" });
    const [offer, trustContext] = await Promise.all([offerPromise, trustPromise]);

    if (!offer) {
      return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
    }

    const isBuyer = offer.buyer_agent_id === agentId;
    const isSeller = offer.seller_agent_id === agentId;
    if (!isBuyer && !isSeller) {
      // Anti-enumeration: pretend it doesn't exist.
      return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
    }

    if (offer.status !== "CREATED") {
      return jsonResponse(
        409,
        errorPayload("OFFER_NOT_COUNTERABLE", "Offer not counterable", { status: offer.status })
      );
    }

    const listing = await getListing(offer.listing_id);
    if (!listing) {
      return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
    }

    const flags = Array.isArray(trustContext?.trust_flags) ? trustContext.trust_flags : [];
    if (isTrustRestricted(flags)) {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "trust" };
      }
      return jsonResponse(403, errorPayload("TRUST_RESTRICTED", "Agent trust restrictions prevent offers"));
    }

    const targetOwnerId = listing.owner_id || null;

    let policyDecision: any = { decision: POLICY_DECISION.N_A, policy_version: null, reason: null };
    let policyRecord: any = null;

    if (targetOwnerId) {
      policyRecord = await getPolicyOrDefault(targetOwnerId);

      const allowlistResponse = await enforceAllowlist({
        ownerId: targetOwnerId,
        agentId,
        ctx,
        policyRecord
      });
      if (allowlistResponse) {
        return allowlistResponse;
      }

      policyDecision = evaluatePolicyAction({
        policy: policyRecord?.policy_json || {},
        action: "offer.create",
        offerAmount: amount,
        offerCurrency: currency
      });

      if (ctx) {
        ctx.policy = {
          decision: policyDecision.decision,
          policy_version: policyDecision.policy_version,
          approval_id: null
        };
      }
    } else if (ctx) {
      ctx.policy = { decision: "N_A", policy_version: null, approval_id: null };
    }

    if (ctx?.body && typeof ctx.body === "object") {
      ctx.body.thread_id = offer.thread_id;
      ctx.body.listing_id = offer.listing_id;
    }

    const openOffer = await getOpenOfferForThread({ threadId: offer.thread_id });
    if (openOffer && openOffer.offer_id !== previousOfferId) {
      if (ctx) {
        ctx.auditEvent = "offer.already_open";
        ctx.outcome = { type: "BLOCKED", reason: "conflict" };
      }
      return jsonResponse(
        409,
        errorPayload("OFFER_ALREADY_OPEN", "Offer already open", {
          existing_offer_id: openOffer.offer_id
        })
      );
    }

    const quarantineApplied = Boolean(trustContext?.quarantine_applied);
    const requiresApproval =
      Boolean(targetOwnerId) &&
      (quarantineApplied || policyDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL);

    if (requiresApproval) {
      const reason = quarantineApplied ? "quarantine_applied" : policyDecision.reason || "policy_requires_approval";

      const actionRef = {
        listing_id: offer.listing_id,
        thread_id: offer.thread_id,
        owner_id: targetOwnerId,
        agent_id: agentId,
        buyer_agent_id: offer.buyer_agent_id,
        seller_agent_id: offer.seller_agent_id,
        previous_offer_id: previousOfferId,
        amount,
        currency,
        expires_at: expiresAt,
        quarantine_applied: quarantineApplied,
        policy_reason: policyDecision.reason || null
      };

      const actionRefId = crypto
        .createHash("sha256")
        .update(
          canonicalJsonStringify({
            previous_offer_id: previousOfferId,
            thread_id: offer.thread_id,
            agent_id: agentId,
            amount,
            currency,
            expires_at: expiresAt
          })
        )
        .digest("hex");

      const approval = await createApproval({
        ownerId: targetOwnerId,
        actionType: "offer_over_budget",
        actionRef,
        actionRefId,
        actionPayload: {
          offer: { amount, currency, expires_at: expiresAt },
          policy: {
            decision: policyDecision.decision,
            reason: policyDecision.reason || null,
            policy_version: policyDecision.policy_version
          },
          quarantine_applied: quarantineApplied
        },
        createdByAgentId: agentId
      });

      if (ctx) {
        ctx.auditEvent = "offer.approval_required";
        ctx.outcome = { type: "BLOCKED", reason: quarantineApplied ? "trust" : "policy" };
        ctx.policy = {
          decision: policyDecision.decision,
          policy_version: policyDecision.policy_version,
          approval_id: approval.approval_id
        };
      }

      return jsonResponse(
        409,
        errorPayload("APPROVAL_REQUIRED", "Approval required", {
          approval_id: approval.approval_id,
          reason
        })
      );
    }

    const next = await counterOffer({
      previousOfferId,
      threadId: offer.thread_id,
      amount,
      currency,
      expiresAt,
      senderId: agentId
    });

    if (ctx) {
      ctx.auditEvent = "offer.counter";
      if (ctx.body && typeof ctx.body === "object") {
        ctx.body.offer_id = next.offer_id;
      }
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: "offer.countered",
        actor: { type: "agent", id: agentId },
        entity: { type: "offer", id: previousOfferId },
        payload: {
          new_offer_id: next.offer_id,
          listing_id: offer.listing_id,
          thread_id: offer.thread_id,
          previous_status: offer.status,
          new_status: "COUNTERED"
        }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "offer.countered", error: error?.message || String(error) });
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: "offer.created",
        actor: { type: "agent", id: agentId },
        entity: { type: "offer", id: next.offer_id },
        payload: {
          listing_id: offer.listing_id,
          thread_id: offer.thread_id,
          status: next.status,
          previous_offer_id: previousOfferId
        }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "offer.created", error: error?.message || String(error) });
    }

    return jsonResponse(201, mapOfferResponse(next));
  } catch (error) {
    return jsonResponse(
      error.status || 500,
      errorPayload(error.code || "ERROR", error.message, error.details)
    );
  }
}

export default withApiMiddlewares(handler, { routeGroup: "offers.create" });
