import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getListing, updateListingBySeller } from "../../../../server/services/listings";
import { resolveTrustContext } from "../../../../server/trustscore/context";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../../server/services/policies";
import { cancelPendingListingPublishApproval, createApproval } from "../../../../server/services/approvals";
import { publishSseEvent } from "../../../../server/sse/store";
import { ALLOWED_CURRENCIES } from "../../../../server/config/deals";
import { isUuid } from "../../../../server/utils/validators";
import { matchListingToWatchlists } from "../../../../server/services/watchlist-matching";

const LOCKED_STATES = new Set([
  "RESERVED",
  "CONTACT_REVEALED",
  "COMPLETED",
  "REMOVED",
  "EXPIRED"
]);

const MUTABLE_STATES = new Set(["DRAFT", "PENDING_APPROVAL", "LIVE"]);

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripHtmlTags(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>/g, "");
}

function mapListingDetail(listing: any) {
  const geo =
    typeof listing?.geo_lat === "number" && Number.isFinite(listing.geo_lat) &&
    typeof listing?.geo_lng === "number" && Number.isFinite(listing.geo_lng)
      ? { lat: listing.geo_lat, lng: listing.geo_lng }
      : null;

  return {
    listing_id: listing.listing_id,
    status: listing.status,
    title: listing.title,
    description: listing.description ?? null,
    category: listing.category,
    condition: listing.condition,
    price: {
      amount: listing.price_amount,
      currency: listing.currency
    },
    geo,
    photos: listing.photos ?? null,
    deal_id: listing.deal_id ?? null,
    created_at: listing.created_at,
    updated_at: listing.updated_at ?? null
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const rawId = resolveParam(req.query?.id);
  const listingId = typeof rawId === "string" ? rawId : String(rawId || "");
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "listing.viewed";
      ctx.body = { listing_id: listingId };
    }

    try {
      const listing = await getListing(listingId);
      if (!listing) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
      }

      if (listing.status !== "LIVE" && listing.seller_agent_id !== ctx.agentId) {
        // Anti-enumeration: do not reveal listing status for non-sellers.
        return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
      }

      return jsonResponse(200, { data: mapListingDetail(listing) });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const body = req.body || {};
  const rawTitle = body.title;
  const rawDescription = body.description;
  const rawPrice = body.price;
  const rawStatus = body.status;

  const hasTitle = rawTitle !== undefined;
  const hasDescription = rawDescription !== undefined;
  const hasPrice = rawPrice !== undefined;
  const hasStatus = rawStatus !== undefined;

  if (!hasTitle && !hasDescription && !hasPrice && !hasStatus) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "At least one of title, description, price, status is required"));
  }

  const fieldsChanged: string[] = [];

  let title = undefined;
  let description = undefined;
  let priceAmount = undefined;
  let currency = undefined;
  let requestedStatus = null;

  try {
    if (hasTitle) {
      if (typeof rawTitle !== "string") {
        throw new Error("title must be a string");
      }
      const normalized = stripHtmlTags(rawTitle).trim();
      if (!normalized) {
        throw new Error("title must be non-empty");
      }
      if (normalized.length < 1 || normalized.length > 120) {
        throw new Error("title must be 1..120 characters");
      }
      title = normalized;
      fieldsChanged.push("title");
    }

    if (hasDescription) {
      if (rawDescription === null) {
        description = null;
      } else {
        if (typeof rawDescription !== "string") {
          throw new Error("description must be a string");
        }
        const normalized = stripHtmlTags(rawDescription).trim();
        description = normalized ? normalized : null;
      }
      if (typeof description === "string" && description.length > 4000) {
        throw new Error("description must be 0..4000 characters");
      }
      fieldsChanged.push("description");
    }

    if (hasPrice) {
      if (!rawPrice || typeof rawPrice !== "object" || Array.isArray(rawPrice)) {
        throw new Error("price must be an object");
      }
      priceAmount = (rawPrice as any).amount;
      if (
        typeof priceAmount !== "number" ||
        !Number.isFinite(priceAmount) ||
        !Number.isSafeInteger(priceAmount) ||
        priceAmount < 0
      ) {
        throw new Error("price.amount must be an integer >= 0");
      }
      currency = (rawPrice as any).currency;
      if (typeof currency !== "string" || !currency.trim()) {
        throw new Error("price.currency is required");
      }
      currency = currency.trim().toUpperCase();
      if (!ALLOWED_CURRENCIES.has(currency)) {
        throw new Error("price.currency is invalid");
      }
      fieldsChanged.push("price");
    }

    if (hasStatus) {
      if (typeof rawStatus !== "string") {
        throw new Error("status must be a string");
      }
      requestedStatus = rawStatus.trim().toUpperCase();
      if (requestedStatus !== "LIVE" && requestedStatus !== "REMOVED") {
        throw new Error("status is invalid");
      }
      fieldsChanged.push("status");
    }
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  try {
    const agentId = ctx.agentId;
    const listing = await getListing(listingId);
    if (!listing || listing.seller_agent_id !== agentId) {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "ownership" };
      }
      return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
    }

    const currentStatus = listing.status;
    if (LOCKED_STATES.has(currentStatus)) {
      return jsonResponse(409, errorPayload("LISTING_LOCKED", "Listing is locked"));
    }

    // Updating fields is only allowed in mutable states (even if we are also transitioning to REMOVED).
    const wantsFieldUpdate = title !== undefined || description !== undefined || priceAmount !== undefined || currency !== undefined;
    if (wantsFieldUpdate && !MUTABLE_STATES.has(currentStatus)) {
      return jsonResponse(409, errorPayload("LISTING_LOCKED", "Listing is locked"));
    }

    const now = new Date();

    let nextStatus = currentStatus;
    let approvalId = null;

    if (requestedStatus) {
      if (requestedStatus === "REMOVED") {
        if (!MUTABLE_STATES.has(currentStatus)) {
          return jsonResponse(409, errorPayload("INVALID_STATUS_TRANSITION", "Invalid listing status transition"));
        }
        nextStatus = "REMOVED";
      } else if (requestedStatus === "LIVE") {
        if (currentStatus !== "DRAFT") {
          return jsonResponse(409, errorPayload("INVALID_STATUS_TRANSITION", "Invalid listing status transition"));
        }

        const trust = await resolveTrustContext({ ctx, actionType: "listing.create" });
        const flags = Array.isArray(trust?.trust_flags) ? trust.trust_flags : [];

        // Block publishing attempts for restricted agents (align with listing.create behavior).
        if (flags.some((f) => f === "under_review" || f === "restricted" || f === "suspended")) {
          if (ctx) {
            ctx.outcome = { type: "BLOCKED", reason: "trust" };
          }
          return jsonResponse(403, errorPayload("TRUST_RESTRICTED", "Agent trust restrictions prevent publishing"));
        }

        const ownerId = listing.owner_id || ctx.ownerId || null;
        let policyDecision: any = { decision: POLICY_DECISION.N_A, policy_version: null };
        if (ownerId) {
          const policyRecord = await getPolicyOrDefault(ownerId);
          // Compat: accept either "listing.publish" or legacy "listing.create" for auto-publish.
          const publishDecision = evaluatePolicyAction({
            policy: policyRecord?.policy_json || {},
            action: "listing.publish"
          });
          if (publishDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL) {
            const legacyDecision = evaluatePolicyAction({
              policy: policyRecord?.policy_json || {},
              action: "listing.create"
            });
            policyDecision =
              legacyDecision.decision === POLICY_DECISION.AUTO_APPROVED
                ? legacyDecision
                : publishDecision;
          } else {
            policyDecision = publishDecision;
          }
        }

        if (ctx) {
          ctx.policy = {
            decision: policyDecision.decision,
            policy_version: policyDecision.policy_version,
            approval_id: null
          };
        }

        const quarantineApplied = Boolean(trust?.quarantine_applied);
        const requiresApproval = policyDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL;
        nextStatus = quarantineApplied || requiresApproval ? "PENDING_APPROVAL" : "LIVE";

        // Quarantined publish flows require an owner context so we can create an approval.
        // Without an ownerId, we'd create an unresolvable PENDING_APPROVAL listing.
        if (nextStatus === "PENDING_APPROVAL" && !ownerId) {
          if (ctx) {
            ctx.outcome = { type: "BLOCKED", reason: "trust" };
          }
          return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
        }

        if (nextStatus === "PENDING_APPROVAL" && ownerId) {
          const approval = await createApproval({
            ownerId,
            actionType: "listing_publish",
            actionRef: { listing_id: listingId, seller_agent_id: agentId },
            actionRefId: listingId,
            actionPayload: { listing_id: listingId },
            createdByAgentId: agentId
          });
          approvalId = approval.approval_id;
          if (ctx) {
            ctx.policy = {
              decision: policyDecision.decision,
              policy_version: policyDecision.policy_version,
              approval_id: approvalId
            };
          }
        }
      }
    }

    const patch: any = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (priceAmount !== undefined) patch.price_amount = priceAmount;
    if (currency !== undefined) patch.currency = currency;
    if (nextStatus !== currentStatus) patch.status = nextStatus;

    const updated = await updateListingBySeller({
      listingId,
      sellerAgentId: agentId,
      expectedStatus: currentStatus,
      patch,
      now
    });

    if (!updated) {
      const fresh = await getListing(listingId);
      if (!fresh || fresh.seller_agent_id !== agentId) {
        if (ctx) {
          ctx.outcome = { type: "BLOCKED", reason: "ownership" };
        }
        return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
      }
      if (LOCKED_STATES.has(fresh.status)) {
        return jsonResponse(409, errorPayload("LISTING_LOCKED", "Listing is locked"));
      }
      return jsonResponse(409, errorPayload("INVALID_STATUS_TRANSITION", "Invalid listing status transition"));
    }

    const statusChanged = updated.status !== currentStatus;
    if (ctx) {
      // Ensure request-level audit never stores plaintext title/description.
      const safeTitleLen = typeof rawTitle === "string" ? stripHtmlTags(rawTitle).trim().length : null;
      const safeDescriptionLen = typeof rawDescription === "string" ? stripHtmlTags(rawDescription).trim().length : null;
      const safePriceAmount = rawPrice && typeof rawPrice === "object" ? (rawPrice as any).amount ?? null : null;
      const safeCurrency = rawPrice && typeof rawPrice === "object" ? (rawPrice as any).currency ?? null : null;

      ctx.auditEvent = statusChanged ? "listing.status_changed" : "listing.updated";
      ctx.body = {
        listing_id: listingId,
        fields_changed: fieldsChanged,
        title_len: safeTitleLen,
        description_len: safeDescriptionLen,
        price_amount: safePriceAmount,
        currency: safeCurrency,
        requested_status: requestedStatus,
        resolved_status: updated.status
      };
    }

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: "listing.updated",
        actor: { type: "agent", id: agentId },
        entity: { type: "listing", id: listingId },
        payload: {
          fields_changed: fieldsChanged,
          previous_status: currentStatus,
          new_status: updated.status,
          ...(approvalId ? { approval_id: approvalId } : {})
        }
      });
    } catch (error) {
      console.info("sse.publish_failed", { type: "listing.updated", error: error?.message || String(error) });
    }

    if (currentStatus === "PENDING_APPROVAL" && updated.status === "REMOVED") {
      const ownerId = listing.owner_id || ctx.ownerId || null;
      if (ownerId) {
        try {
          await cancelPendingListingPublishApproval({ ownerId, listingId, now });
        } catch (error) {
          // Best-effort: listing removal should not fail due to approval cancellation.
          console.info("approval.cancel_failed", { action: "listing_publish", listingId, error: error?.message || String(error) });
        }
      }
    }

    if (currentStatus !== "LIVE" && updated.status === "LIVE") {
      const effectiveTitle = title !== undefined ? title : listing.title;
      const effectivePriceAmount = priceAmount !== undefined ? priceAmount : listing.price_amount;
      const effectiveCurrency = currency !== undefined ? currency : listing.currency;

      try {
        await matchListingToWatchlists({
          listing: {
            listing_id: listingId,
            title: effectiveTitle,
            category: listing.category,
            condition: listing.condition,
            price_amount: effectivePriceAmount,
            currency: effectiveCurrency,
            geo_lat: listing.geo_lat ?? null,
            geo_lng: listing.geo_lng ?? null
          }
        });
      } catch (error) {
        console.info("watchlist.match_listing_failed", {
          listing_id: listingId,
          error: error?.message || String(error)
        });
      }
    }

    return jsonResponse(200, {
      listing_id: updated.listing_id,
      status: updated.status,
      updated_at: updated.updated_at
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true,
  enableRateLimit: true
});
