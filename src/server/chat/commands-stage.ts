import { jsonResponse } from "../http/response";
import { methodNotAllowed } from "../http/methods";
import { errorPayload } from "../http/errors";
import { isUuid } from "../utils/validators";
import { getStagedCommandTtlSeconds } from "../config/chat-commands";
import { createStagedCommand } from "../services/staged-commands";
import { parseWatchlistCriteria } from "../utils/watchlists";
import { getPolicyOrDefault } from "../services/policies";
import { evaluatePolicyAction } from "../policy/evaluate";
import { getListing } from "../services/listings";
import { getOffer } from "../services/offers";

const ACTION_TYPES = new Set([
  "watchlist.create",
  "listing.create",
  "offer.create",
  "offer.counter",
  "contact_reveal.request",
  "transaction.mark_completed"
]);

function buildPolicyPreview(policyJson: any) {
  if (!policyJson || typeof policyJson !== "object") return [];
  const budgets = policyJson.budgets || {};
  const thresholds = policyJson.approval_thresholds || {};
  const impacts: string[] = [];
  if (typeof budgets.max_offer === "number" && Number.isFinite(budgets.max_offer)) {
    impacts.push(`max_offer=${budgets.max_offer}`);
  }
  if (typeof budgets.currency === "string" && budgets.currency) {
    impacts.push(`currency=${budgets.currency}`);
  }
  if (typeof thresholds.offer_amount_gt === "number" && Number.isFinite(thresholds.offer_amount_gt)) {
    impacts.push(`offer_amount_gt=${thresholds.offer_amount_gt}`);
  }
  if (typeof thresholds.contact_reveal === "string" && thresholds.contact_reveal) {
    impacts.push(`contact_reveal=${thresholds.contact_reveal}`);
  }
  return impacts;
}

function parseOfferPayload(payload: any) {
  const listingId = typeof payload?.listing_id === "string" ? payload.listing_id : null;
  if (!listingId || !isUuid(listingId)) {
    return { ok: false, error: "listing_id must be a UUID" };
  }

  const threadIdRaw = payload?.thread_id;
  const threadId =
    threadIdRaw === undefined || threadIdRaw === null || threadIdRaw === ""
      ? null
      : typeof threadIdRaw === "string"
        ? threadIdRaw
        : null;
  if (threadIdRaw !== undefined && threadIdRaw !== null && threadIdRaw !== "" && !threadId) {
    return { ok: false, error: "thread_id must be a UUID" };
  }
  if (threadId && !isUuid(threadId)) {
    return { ok: false, error: "thread_id must be a UUID" };
  }

  const amount = payload?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, error: "amount must be an integer >= 0" };
  }

  const rawCurrency = payload?.currency;
  if (typeof rawCurrency !== "string" || !rawCurrency.trim()) {
    return { ok: false, error: "currency is required" };
  }
  const currency = rawCurrency.trim().toUpperCase();

  const expiresAtRaw = payload?.expires_at;
  if (typeof expiresAtRaw !== "string" || !expiresAtRaw.trim()) {
    return { ok: false, error: "expires_at is required" };
  }
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "expires_at must be an ISO8601 timestamp" };
  }

  return {
    ok: true as const,
    value: {
      listing_id: listingId,
      thread_id: threadId,
      amount,
      currency,
      expires_at: expiresAt.toISOString()
    }
  };
}

function parseCounterOfferPayload(payload: any) {
  const offerId = typeof payload?.offer_id === "string" ? payload.offer_id : null;
  if (!offerId || !isUuid(offerId)) {
    return { ok: false, error: "offer_id must be a UUID" };
  }

  const amount = payload?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, error: "amount must be an integer >= 0" };
  }

  const rawCurrency = payload?.currency;
  if (typeof rawCurrency !== "string" || !rawCurrency.trim()) {
    return { ok: false, error: "currency is required" };
  }
  const currency = rawCurrency.trim().toUpperCase();

  const expiresAtRaw = payload?.expires_at;
  if (typeof expiresAtRaw !== "string" || !expiresAtRaw.trim()) {
    return { ok: false, error: "expires_at is required" };
  }
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "expires_at must be an ISO8601 timestamp" };
  }

  return {
    ok: true as const,
    value: {
      offer_id: offerId,
      amount,
      currency,
      expires_at: expiresAt.toISOString()
    }
  };
}

function parseTxPayload(payload: any) {
  const txId = typeof payload?.tx_id === "string" ? payload.tx_id : null;
  if (!txId || !isUuid(txId)) {
    return { ok: false, error: "tx_id must be a UUID" };
  }
  return { ok: true as const, value: { tx_id: txId } };
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner context required"));
  }

  const body = req.body || {};
  const actionTypeRaw = body.action_type;
  const actionType = typeof actionTypeRaw === "string" ? actionTypeRaw.trim() : "";
  if (!actionType || !ACTION_TYPES.has(actionType)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action_type is invalid"));
  }

  const channelIdentityIdRaw = body.channel_identity_id;
  const channelIdentityId =
    channelIdentityIdRaw === undefined || channelIdentityIdRaw === null || channelIdentityIdRaw === ""
      ? null
      : typeof channelIdentityIdRaw === "string"
        ? channelIdentityIdRaw
        : null;
  if (
    channelIdentityIdRaw !== undefined &&
    channelIdentityIdRaw !== null &&
    channelIdentityIdRaw !== "" &&
    !channelIdentityId
  ) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "channel_identity_id must be a UUID"));
  }
  if (channelIdentityId && !isUuid(channelIdentityId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "channel_identity_id must be a UUID"));
  }

  const payload = body.payload || {};

  const now = new Date();
  const ttlSeconds = getStagedCommandTtlSeconds();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  let normalizedPayload: any = null;
  let preview: any = null;

  try {
    if (actionType === "watchlist.create") {
      const { name, criteria: rawCriteria, active: rawActive } = payload || {};

      let normalizedName = null;
      if (name !== undefined && name !== null) {
        if (typeof name !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be a string"));
        }
        const trimmed = name.trim();
        if (trimmed) {
          if (trimmed.length > 80) {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be at most 80 characters"));
          }
          normalizedName = trimmed;
        }
      }

      let active = true;
      if (rawActive !== undefined && rawActive !== null) {
        if (typeof rawActive !== "boolean") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "active must be a boolean"));
        }
        active = rawActive;
      }

      let criteria;
      try {
        criteria = parseWatchlistCriteria(rawCriteria);
      } catch (error: any) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }

      normalizedPayload = {
        name: normalizedName,
        active,
        criteria: rawCriteria
      };

      preview = {
        title: normalizedName ? `Create watchlist: ${normalizedName}` : "Create watchlist",
        details: {
          active,
          query: criteria.queryText || null,
          tags: criteria.tags || [],
          price_max: criteria.priceMax ?? null,
          geo: criteria.geoLat != null && criteria.geoLon != null ? { lat: criteria.geoLat, lon: criteria.geoLon } : null,
          distance_km: criteria.distanceKm ?? null
        },
        policy: null,
        risk: null
      };
    } else if (actionType === "listing.create") {
      const titleRaw = payload?.title;
      if (typeof titleRaw !== "string" || !titleRaw.trim()) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title is required"));
      }
      const title = titleRaw.trim();
      if (title.length > 120) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title must be at most 120 characters"));
      }

      const descriptionRaw = payload?.description;
      let description: string | null = null;
      if (descriptionRaw !== undefined && descriptionRaw !== null) {
        if (typeof descriptionRaw !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "description must be a string"));
        }
        description = descriptionRaw;
        if (description.length > 4000) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "description must be at most 4000 characters"));
        }
      }

      const categoryRaw = payload?.category;
      const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";
      if (!category) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "category is required"));
      }

      const conditionRaw = payload?.condition;
      const condition = typeof conditionRaw === "string" ? conditionRaw.trim().toUpperCase() : "";
      const allowedConditions = new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]);
      if (!allowedConditions.has(condition)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "condition is invalid"));
      }

      const price = payload?.price;
      const amount = price?.amount;
      const currencyRaw = price?.currency;
      if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < 0) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price.amount must be an integer >= 0"));
      }
      const currency = typeof currencyRaw === "string" ? currencyRaw.trim().toUpperCase() : "";
      if (!currency || currency.length !== 3) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price.currency is invalid"));
      }

      const publish = payload?.publish;
      if (typeof publish !== "boolean") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "publish must be a boolean"));
      }

      normalizedPayload = {
        title,
        description,
        category,
        condition,
        price: { amount, currency },
        publish,
        geo: payload?.geo ?? null,
        photos: payload?.photos ?? null,
        deal_id: payload?.deal_id ?? undefined
      };

      const policyRecord = await getPolicyOrDefault(ctx.ownerId);
      const policyDecision = evaluatePolicyAction({
        policy: policyRecord?.policy_json || {},
        action: "listing.create"
      });

      preview = {
        title: `Create listing: ${title}`,
        details: {
          price: { amount, currency },
          publish
        },
        policy: {
          decision: policyDecision.decision,
          reason: policyDecision.reason || null,
          policy_version: policyDecision.policy_version,
          impacts: buildPolicyPreview(policyRecord?.policy_json || {})
        },
        risk: null
      };
    } else if (actionType === "offer.create") {
      const parsed = parseOfferPayload(payload);
      if (!parsed.ok) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      normalizedPayload = parsed.value;

      const listing = await getListing(parsed.value.listing_id);
      if (!listing) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Listing not found"));
      }

      const ownerId = listing.owner_id || null;
      const policyRecord = ownerId ? await getPolicyOrDefault(ownerId) : null;
      const policyDecision = policyRecord
        ? evaluatePolicyAction({
            policy: policyRecord?.policy_json || {},
            action: "offer.create",
            offerAmount: parsed.value.amount,
            offerCurrency: parsed.value.currency
          })
        : { decision: "N_A", reason: null, policy_version: null };

      preview = {
        title: "Create offer",
        details: {
          listing_id: parsed.value.listing_id,
          thread_id: parsed.value.thread_id,
          amount: parsed.value.amount,
          currency: parsed.value.currency,
          expires_at: parsed.value.expires_at
        },
        policy: policyRecord
          ? {
              decision: policyDecision.decision,
              reason: policyDecision.reason || null,
              policy_version: policyDecision.policy_version,
              impacts: buildPolicyPreview(policyRecord?.policy_json || {})
            }
          : null,
        risk: null
      };
    } else if (actionType === "offer.counter") {
      const parsed = parseCounterOfferPayload(payload);
      if (!parsed.ok) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      normalizedPayload = parsed.value;

      const previous = await getOffer(parsed.value.offer_id);
      if (!previous) {
        return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
      }

      const isBuyer = previous.buyer_agent_id === ctx.agentId;
      const isSeller = previous.seller_agent_id === ctx.agentId;
      if (!isBuyer && !isSeller) {
        // Anti-enumeration: pretend it doesn't exist.
        return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
      }

      const listing = await getListing(previous.listing_id);
      if (!listing) {
        return jsonResponse(404, errorPayload("OFFER_NOT_FOUND", "Offer not found"));
      }

      const ownerId = listing.owner_id || null;
      const policyRecord = ownerId ? await getPolicyOrDefault(ownerId) : null;
      const policyDecision = policyRecord
        ? evaluatePolicyAction({
            policy: policyRecord?.policy_json || {},
            action: "offer.create",
            offerAmount: parsed.value.amount,
            offerCurrency: parsed.value.currency
          })
        : { decision: "N_A", reason: null, policy_version: null };

      preview = {
        title: "Counter offer",
        details: {
          offer_id: parsed.value.offer_id,
          amount: parsed.value.amount,
          currency: parsed.value.currency,
          expires_at: parsed.value.expires_at
        },
        policy: policyRecord
          ? {
              decision: policyDecision.decision,
              reason: policyDecision.reason || null,
              policy_version: policyDecision.policy_version,
              impacts: buildPolicyPreview(policyRecord?.policy_json || {})
            }
          : null,
        risk: null
      };
    } else if (actionType === "contact_reveal.request") {
      const parsed = parseTxPayload(payload);
      if (!parsed.ok) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      normalizedPayload = parsed.value;
      preview = {
        title: "Request contact reveal",
        details: { tx_id: parsed.value.tx_id },
        policy: { decision: "REQUIRES_APPROVAL", reason: "contact_reveal_sensible" },
        risk: { level: "HIGH", reason: "contact_reveal_sensible" }
      };
    } else if (actionType === "transaction.mark_completed") {
      const parsed = parseTxPayload(payload);
      if (!parsed.ok) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      normalizedPayload = parsed.value;
      preview = {
        title: "Mark transaction completed",
        details: { tx_id: parsed.value.tx_id },
        policy: null,
        risk: null
      };
    } else {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported action_type"));
    }
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }

  // Ensure we don't stage garbage if payload parsing failed.
  if (!normalizedPayload) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "payload is required"));
  }

  // Avoid requiring the client to pass an Idempotency-Key for staging: each stage call yields a new command_id.
  const staged = await createStagedCommand({
    ownerId: ctx.ownerId,
    agentId: ctx.agentId,
    channelIdentityId,
    actionType,
    payload: { action_type: actionType, payload: normalizedPayload },
    expiresAt,
    now
  });

  if (ctx) {
    ctx.auditEvent = "chat.command_staged";
    ctx.auditEntityType = "staged_command";
    ctx.auditEntityId = staged.command_id;
    ctx.body = {
      command_id: staged.command_id,
      action_type: actionType,
      expires_at: staged.expires_at,
      channel_identity_id: channelIdentityId
    };
  }

  return jsonResponse(201, {
    command_id: staged.command_id,
    state: staged.state,
    action_type: actionType,
    expires_at: staged.expires_at,
    preview,
    buttons: [
      { id: "confirm", label: "Confirmer", action: "confirm" },
      { id: "modify", label: "Modifier", action: "modify" },
      { id: "cancel", label: "Annuler", action: "cancel" }
    ]
  });
}

