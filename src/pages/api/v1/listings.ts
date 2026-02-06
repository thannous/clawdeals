import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createListing, listListings } from "../../../server/services/listings";
import { resolveTrustContext } from "../../../server/trustscore/context";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../server/services/policies";
import { createApproval } from "../../../server/services/approvals";
import { publishSseEvent } from "../../../server/sse/store";
import { decodeListingsCursor } from "../../../server/services/listings-cursor";
import { ALLOWED_CURRENCIES } from "../../../server/config/deals";
import { isUuid } from "../../../server/utils/validators";

const CONDITIONS = new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]);

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripHtmlTags(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>/g, "");
}

function parseIntegerQueryParam(raw, name) {
  if (raw === undefined || raw === null || raw === "") return null;
  const asString = typeof raw === "string" ? raw : String(raw);
  const trimmed = asString.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`${name} must be an integer`);
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${name} must be an integer`);
  }
  return n;
}

function parseNonEmptyString(value, name) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function parseOptionalString(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseGeo(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("geo must be an object");
  }
  const { lat, lng } = value as any;
  if (typeof lat !== "number" || !Number.isFinite(lat)) {
    throw new Error("geo.lat must be a number");
  }
  if (typeof lng !== "number" || !Number.isFinite(lng)) {
    throw new Error("geo.lng must be a number");
  }
  if (lat < -90 || lat > 90) {
    throw new Error("geo.lat must be between -90 and 90");
  }
  if (lng < -180 || lng > 180) {
    throw new Error("geo.lng must be between -180 and 180");
  }
  return { lat, lng };
}

function parsePhotos(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error("photos must be an array");
  }
  const normalized = [];
  for (let idx = 0; idx < value.length; idx += 1) {
    const entry = value[idx];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`photos[${idx}] must be an object`);
    }
    const storageKey = (entry as any).storage_key;
    const mime = (entry as any).mime;
    if (typeof storageKey !== "string" || !storageKey.trim()) {
      throw new Error(`photos[${idx}].storage_key is required`);
    }
    if (typeof mime !== "string" || !mime.trim()) {
      throw new Error(`photos[${idx}].mime is required`);
    }

    const w = (entry as any).w;
    const h = (entry as any).h;
    if (w !== undefined && w !== null) {
      if (typeof w !== "number" || !Number.isFinite(w) || !Number.isSafeInteger(w) || w < 1) {
        throw new Error(`photos[${idx}].w must be a positive integer`);
      }
    }
    if (h !== undefined && h !== null) {
      if (typeof h !== "number" || !Number.isFinite(h) || !Number.isSafeInteger(h) || h < 1) {
        throw new Error(`photos[${idx}].h must be a positive integer`);
      }
    }

    normalized.push({
      storage_key: storageKey.trim(),
      mime: mime.trim(),
      ...(w != null ? { w } : {}),
      ...(h != null ? { h } : {})
    });
  }
  return normalized;
}

function mapListingRow(row) {
  return {
    listing_id: row.listing_id,
    title: row.title,
    category: row.category,
    condition: row.condition,
    price: {
      amount: row.price_amount,
      currency: row.currency
    },
    distance_km: null,
    created_at: row.created_at
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  // Always redact before early returns (auth errors, validation errors, etc),
  // to avoid leaking free-form text in audit logs.
  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "listings.listed";

      // Redact q/cursor from audit query to avoid leaking free-form text.
      const safeQuery = { ...(req.query || {}) } as any;
      delete safeQuery.q;
      delete safeQuery.cursor;
      ctx.query = safeQuery;
    }
  } else if (req.method === "POST") {
    if (ctx) {
      ctx.auditEvent = "listing.create";

      const body = req.body || {};
      const rawTitle = body.title;
      const rawDescription = body.description;
      const rawCategory = body.category;
      const rawPrice = body.price;
      const rawGeo = body.geo;
      const rawPhotos = body.photos;
      const rawPublish = body.publish;

      // Ensure request-level audit never stores plaintext title/description.
      const titleLen = typeof rawTitle === "string" ? stripHtmlTags(rawTitle).trim().length : null;
      const descriptionLen = typeof rawDescription === "string" ? stripHtmlTags(rawDescription).trim().length : null;
      ctx.body = {
        title_len: titleLen,
        description_len: descriptionLen,
        category: typeof rawCategory === "string" ? rawCategory.trim() || null : null,
        publish: typeof rawPublish === "boolean" ? rawPublish : true,
        price_amount: rawPrice && typeof rawPrice === "object" ? (rawPrice as any).amount ?? null : null,
        currency: rawPrice && typeof rawPrice === "object" ? (rawPrice as any).currency ?? null : null,
        photos_count: Array.isArray(rawPhotos) ? rawPhotos.length : null,
        has_geo: rawGeo != null
      };
    }
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (req.method === "GET") {

    const sortRaw = resolveParam(req.query?.sort);
    const sortValue = sortRaw ? String(sortRaw).trim().toLowerCase() : "recent";
    if (sortValue !== "recent" && sortValue !== "price_asc" && sortValue !== "price_desc" && sortValue !== "distance") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort is invalid"));
    }

    const rawLat = resolveParam(req.query?.lat);
    const rawLng = resolveParam(req.query?.lng);
    const rawDistance = resolveParam(req.query?.distance_km);

    const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== "";
    const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== "";
    const hasDistance = rawDistance !== undefined && rawDistance !== null && rawDistance !== "";
    const sortIsDistance = sortValue === "distance";

    if ((hasLat && !hasLng) || (hasLng && !hasLat)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required together"));
    }
    if (hasDistance && (!hasLat || !hasLng)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required when distance_km is provided"));
    }
    if (sortIsDistance && (!hasLat || !hasLng)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required when sort=distance"));
    }
    if (hasLat || hasLng || hasDistance || sortIsDistance) {
      return jsonResponse(501, errorPayload("GEO_NOT_SUPPORTED", "Geo search is not supported in v0"));
    }

    const rawLimit = resolveParam(req.query?.limit);
    let limit = 50;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
      let parsed;
      try {
        parsed = parseIntegerQueryParam(rawLimit, "limit");
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }
      if (parsed < 1 || parsed > 100) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be between 1 and 100"));
      }
      limit = parsed;
    }

    const rawQuery = resolveParam(req.query?.q);
    let q = null;
    if (rawQuery !== undefined && rawQuery !== null && rawQuery !== "") {
      if (typeof rawQuery !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "q must be a string"));
      }
      const trimmed = rawQuery.trim();
      if (trimmed) {
        if (trimmed.length > 200) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "q must be 0..200 characters"));
        }
        q = trimmed;
      }
    }

    const categoryRaw = resolveParam(req.query?.category);
    let category = null;
    if (categoryRaw !== undefined && categoryRaw !== null && categoryRaw !== "") {
      if (typeof categoryRaw !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "category must be a string"));
      }
      const trimmed = categoryRaw.trim();
      if (trimmed) {
        category = trimmed;
      }
    }

    const conditionRaw = resolveParam(req.query?.condition);
    let condition = null;
    if (conditionRaw !== undefined && conditionRaw !== null && conditionRaw !== "") {
      if (typeof conditionRaw !== "string") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "condition must be a string"));
      }
      const normalized = conditionRaw.trim().toUpperCase();
      if (!CONDITIONS.has(normalized)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "condition is invalid"));
      }
      condition = normalized;
    }

    let priceMin = null;
    let priceMax = null;
    try {
      priceMin = parseIntegerQueryParam(resolveParam(req.query?.price_min), "price_min");
      priceMax = parseIntegerQueryParam(resolveParam(req.query?.price_max), "price_max");
    } catch (error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
    }
    if (priceMin != null && priceMin < 0) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_min must be >= 0"));
    }
    if (priceMax != null && priceMax < 0) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_max must be >= 0"));
    }
    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_min must be <= price_max"));
    }

    const rawCursor = resolveParam(req.query?.cursor);
    let cursor = null;
    if (rawCursor) {
      const parsed = decodeListingsCursor(String(rawCursor));
      if (parsed?.error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      if (parsed?.value?.sort !== sortValue) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match sort"));
      }
      cursor = parsed?.value || null;
    }

    if (ctx) {
      ctx.body = {
        q_len: q ? q.length : 0,
        has_category: Boolean(category),
        has_condition: Boolean(condition),
        has_price_min: priceMin != null,
        has_price_max: priceMax != null,
        sort: sortValue,
        limit,
        has_cursor: Boolean(rawCursor)
      };
    }

    try {
      const result = await listListings({
        q,
        category,
        condition,
        priceMin,
        priceMax,
        sort: sortValue,
        limit,
        cursor
      });

      return jsonResponse(200, {
        data: (result.items || []).map(mapListingRow),
        next_cursor: result.nextCursor
      });
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
  const rawCategory = body.category;
  const rawCondition = body.condition;
  const rawPrice = body.price;
  const rawGeo = body.geo;
  const rawPhotos = body.photos;
  const rawPublish = body.publish;
  const rawDealId = body.deal_id;

  let title;
  let description;
  let category;
  let condition;
  let priceAmount;
  let currency;
  let geo;
  let photos;
  let publish = true;
  let dealId = null;

  try {
    title = stripHtmlTags(parseNonEmptyString(rawTitle, "title")).trim();
    if (title.length < 1 || title.length > 120) {
      throw new Error("title must be 1..120 characters");
    }

    description = parseOptionalString(rawDescription, "description");
    description = description ? stripHtmlTags(description).trim() : null;
    if (description && description.length > 4000) {
      throw new Error("description must be 0..4000 characters");
    }

    category = parseNonEmptyString(rawCategory, "category");

    condition = parseNonEmptyString(rawCondition, "condition").toUpperCase();
    if (!CONDITIONS.has(condition)) {
      throw new Error("condition is invalid");
    }

    if (!rawPrice || typeof rawPrice !== "object" || Array.isArray(rawPrice)) {
      throw new Error("price must be an object");
    }
    priceAmount = (rawPrice as any).amount;
    if (typeof priceAmount !== "number" || !Number.isFinite(priceAmount) || !Number.isSafeInteger(priceAmount) || priceAmount < 0) {
      throw new Error("price.amount must be an integer >= 0");
    }
    currency = parseNonEmptyString((rawPrice as any).currency, "price.currency").toUpperCase();
    if (!ALLOWED_CURRENCIES.has(currency)) {
      throw new Error("price.currency is invalid");
    }

    geo = parseGeo(rawGeo);
    photos = parsePhotos(rawPhotos);

    if (rawPublish !== undefined && rawPublish !== null) {
      if (typeof rawPublish !== "boolean") {
        throw new Error("publish must be a boolean");
      }
      publish = rawPublish;
    }

    if (rawDealId !== undefined && rawDealId !== null && rawDealId !== "") {
      if (typeof rawDealId !== "string" || !isUuid(rawDealId)) {
        throw new Error("deal_id must be a UUID");
      }
      dealId = rawDealId;
    }
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  try {
    const trust = await resolveTrustContext({ ctx, actionType: "listing.create" });
    const flags = Array.isArray(trust?.trust_flags) ? trust.trust_flags : [];

    if (publish && flags.some((f) => f === "under_review" || f === "restricted" || f === "suspended")) {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "trust" };
      }
      return jsonResponse(403, errorPayload("TRUST_RESTRICTED", "Agent trust restrictions prevent publishing"));
    }

    const ownerId = ctx.ownerId || null;
    const agentId = ctx.agentId || null;

    let policyDecision: any = { decision: POLICY_DECISION.N_A, policy_version: null };
    if (ownerId) {
      const policyRecord = await getPolicyOrDefault(ownerId);
      policyDecision = evaluatePolicyAction({
        policy: policyRecord?.policy_json || {},
        action: "listing.create"
      });
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

    // Quarantined publish flows require an owner context so we can create an approval.
    // Without an ownerId, we'd create an unresolvable PENDING_APPROVAL listing.
    if (publish && quarantineApplied && !ownerId) {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "trust" };
      }
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }

    const status = !publish
      ? "DRAFT"
      : quarantineApplied || requiresApproval
        ? "PENDING_APPROVAL"
        : "LIVE";

    const listing = await createListing({
      title,
      description,
      category,
      condition,
      status,
      priceAmount,
      currency,
      geoLat: geo ? geo.lat : null,
      geoLng: geo ? geo.lng : null,
      photos,
      dealId,
      ownerId,
      agentId,
      sellerAgentId: agentId
    });

    let approvalId = null;
    if (status === "PENDING_APPROVAL" && ownerId) {
      const approval = await createApproval({
        ownerId,
        actionType: "listing_publish",
        actionRef: { listing_id: listing.listing_id, seller_agent_id: agentId },
        actionRefId: listing.listing_id,
        actionPayload: { listing_id: listing.listing_id },
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

    try {
      await publishSseEvent({
        audienceType: "agent",
        audienceId: agentId,
        type: "listing.created",
        actor: { type: "agent", id: agentId },
        entity: { type: "listing", id: listing.listing_id },
        payload: { status, category }
      });
    } catch (error) {
      // Best-effort: listing creation should not fail due to SSE infra.
      console.info("sse.publish_failed", { type: "listing.created", error: error?.message || String(error) });
    }

    return jsonResponse(201, {
      listing_id: listing.listing_id,
      status,
      created_at: listing.created_at
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
