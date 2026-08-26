import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getListing } from "../../../../../server/services/listings";
import { createOrGetThread, createMessage, getThread } from "../../../../../server/services/threads";
import { createOffer, getOpenOfferForThread } from "../../../../../server/services/offers";
import { isUuid } from "../../../../../server/utils/validators";
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
import { enforceBuyMissionOffer } from "../../../../../server/policy/buy-mission-guard";

const POSTGRES_INT4_MAX = 2147483647;

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
    thread_id: offer.thread_id,
    listing_id: offer.listing_id,
    buyer_agent_id: offer.buyer_agent_id,
    seller_agent_id: offer.seller_agent_id,
    amount: offer.amount,
    currency: offer.currency,
    expires_at: offer.expires_at,
    status: offer.status,
    mission_id: offer.buy_mission_id || null,
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

  const rawId = resolveParam(req.query?.id);
  const listingId = rawId ? String(rawId) : "";
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  const buyerAgentId = ctx?.agentId || null;
  if (!buyerAgentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const body = req.body || {};
  const rawMissionId = body.mission_id;
  const missionId =
    rawMissionId === undefined || rawMissionId === null || rawMissionId === ""
      ? null
      : typeof rawMissionId === "string"
        ? rawMissionId
        : null;
  if (rawMissionId !== undefined && rawMissionId !== null && rawMissionId !== "" && !missionId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "mission_id must be a UUID"));
  }
  if (missionId && !isUuid(missionId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "mission_id must be a UUID"));
  }
  const rawThreadId = body.thread_id;
  const threadId =
    rawThreadId === undefined || rawThreadId === null || rawThreadId === ""
      ? null
      : typeof rawThreadId === "string"
        ? rawThreadId
        : null;
  if (rawThreadId !== undefined && rawThreadId !== null && rawThreadId !== "" && !threadId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread_id must be a UUID"));
  }
  if (threadId && !isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread_id must be a UUID"));
  }

  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "amount must be an integer >= 0"));
  }
  if (amount > POSTGRES_INT4_MAX) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", `amount must be <= ${POSTGRES_INT4_MAX}`));
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
      listing_id: listingId,
      mission_id: missionId,
      thread_id: threadId,
      amount,
      currency,
      expires_at: expiresAt
    };
  }

  try {
    const listingPromise = getListing(listingId);
    const trustPromise = resolveTrustContext({ ctx, actionType: "offer.create" });
    const [listing, trustContext] = await Promise.all([listingPromise, trustPromise]);

    if (!listing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const sellerAgentId = listing.seller_agent_id || null;
    if (!sellerAgentId) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    if (buyerAgentId === sellerAgentId) {
      return jsonResponse(400, errorPayload("SELF_OFFER_FORBIDDEN", "Self offer forbidden"));
    }

    if (listing.status !== "LIVE") {
      return jsonResponse(409, errorPayload("LISTING_NOT_LIVE", "Listing not live"));
    }

    if (missionId) {
      await enforceBuyMissionOffer({
        missionId,
        agentId: buyerAgentId,
        amount,
        currency
      });
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
        agentId: buyerAgentId,
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

    let thread: any = null;
    let threadCreated = false;

    if (threadId) {
      thread = await getThread(threadId);
      if (!thread || thread.listing_id !== listingId || thread.buyer_agent_id !== buyerAgentId || thread.seller_agent_id !== sellerAgentId) {
        // Anti-enumeration: pretend it doesn't exist.
        return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
      }
    } else {
      const resolved = await createOrGetThread({
        listingId,
        ownerId: targetOwnerId,
        buyerAgentId,
        sellerAgentId
      });
      thread = resolved.thread;
      threadCreated = resolved.created;
    }

    if (ctx?.body && typeof ctx.body === "object") {
      ctx.body.thread_id = thread.thread_id;
      ctx.body.thread_created = Boolean(threadCreated);
    }

    const openOffer = await getOpenOfferForThread({ threadId: thread.thread_id });
    if (openOffer) {
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
        listing_id: listingId,
        thread_id: thread.thread_id,
        owner_id: targetOwnerId,
        agent_id: buyerAgentId,
        buyer_agent_id: buyerAgentId,
        seller_agent_id: sellerAgentId,
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
            listing_id: listingId,
            thread_id: thread.thread_id,
            buyer_agent_id: buyerAgentId,
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
        createdByAgentId: buyerAgentId
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

    const offer = await createOffer({
      threadId: thread.thread_id,
      listingId,
      buyerAgentId,
      sellerAgentId,
      previousOfferId: null,
      buyMissionId: missionId,
      amount,
      currency,
      expiresAt
    });

    await createMessage({
      threadId: thread.thread_id,
      senderId: buyerAgentId,
      senderType: "agent",
      type: "offer",
      payload: { type: "offer", offer_id: offer.offer_id },
      redacted: false
    });

    if (ctx) {
      ctx.auditEvent = "offer.create";
      if (ctx.body && typeof ctx.body === "object") {
        ctx.body.offer_id = offer.offer_id;
      }
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: buyerAgentId,
        type: "offer.created",
        actor: { type: "agent", id: buyerAgentId },
        entity: { type: "offer", id: offer.offer_id },
        payload: { listing_id: listingId, thread_id: thread.thread_id, status: offer.status }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "offer.created", error: error?.message || String(error) });
    }

    return jsonResponse(201, mapOfferResponse(offer));
  } catch (error) {
    return jsonResponse(
      error.status || 500,
      errorPayload(error.code || "ERROR", error.message, error.details)
    );
  }
}

export default withApiMiddlewares(handler);
