import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createListing, listListings } from "../../../server/services/listings";
import { findListingDuplicate } from "../../../server/services/listings-duplicates";
import { resolveTrustContext } from "../../../server/trustscore/context";
import { evaluatePolicyAction, POLICY_DECISION } from "../../../server/policy/evaluate";
import { getPolicyOrDefault } from "../../../server/services/policies";
import { createApproval } from "../../../server/services/approvals";
import { publishSseEvent } from "../../../server/sse/store";
import { decodeListingsCursor } from "../../../server/services/listings-cursor";
import { ALLOWED_CURRENCIES, DELIVERY_METHODS } from "../../../server/config/deals";
import { assertNativeMarketCurrency, resolveMarketCode } from "../../../server/config/markets";
import { computeListingDuplicateFingerprint } from "../../../server/utils/listings-duplicates";
import { isUuid } from "../../../server/utils/validators";
import {
  parseCoverImageIndex,
  parseListingsImagesInput,
  resolveCoverImageIndexForWrite
} from "../../../server/media/images";

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

function parseFloatQueryParam(raw, name) {
  if (raw === undefined || raw === null || raw === "") return null;
  const asString = typeof raw === "string" ? raw : String(raw);
  const trimmed = asString.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number`);
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

function mapListingRow(row) {
  const distanceM = typeof row?.distance_m === "number" && Number.isFinite(row.distance_m) ? row.distance_m : null;
  const distanceKm =
    distanceM === null
      ? null
      : Math.round((distanceM / 1000) * 1000) / 1000;

  return {
    listing_id: row.listing_id,
    title: row.title,
    category: row.category,
    condition: row.condition,
    price: {
      amount: row.price_amount,
      currency: row.currency
    },
    market_code: row.market_code || null,
    delivery_method: row.delivery_method || null,
    images_count: typeof row?.images_count === "number" ? row.images_count : 0,
    cover_image: row?.cover_image ?? null,
    distance_km: distanceKm,
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
      const rawImages = body.images;
      const rawPhotos = body.photos;
      const rawCoverImageIndex = body.cover_image_index;
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
        images_count: Array.isArray(rawImages) ? rawImages.length : Array.isArray(rawPhotos) ? rawPhotos.length : null,
        has_cover_image_index: Object.prototype.hasOwnProperty.call(body, "cover_image_index"),
        cover_image_index: rawCoverImageIndex ?? null,
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

    const rawLat = resolveParam(req.query?.lat);
    const rawLng = resolveParam(req.query?.lng);
    const rawDistance = resolveParam(req.query?.distance_km);

    const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== "";
    const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== "";
    const hasDistance = rawDistance !== undefined && rawDistance !== null && rawDistance !== "";

    if ((hasLat && !hasLng) || (hasLng && !hasLat)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required together"));
    }
    if (hasDistance && (!hasLat || !hasLng)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required when distance_km is provided"));
    }

    const sortRaw = resolveParam(req.query?.sort);
    const sortProvided = sortRaw !== undefined && sortRaw !== null && String(sortRaw).trim() !== "";
    let sortValue = sortProvided ? String(sortRaw).trim().toLowerCase() : hasLat ? "distance" : "recent";
    if (sortValue !== "recent" && sortValue !== "price_asc" && sortValue !== "price_desc" && sortValue !== "distance" && sortValue !== "rank") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort is invalid"));
    }

    if (hasLat && sortProvided && sortValue !== "distance") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort must be distance when using geo"));
    }

    const sortIsDistance = sortValue === "distance";
    if (sortIsDistance && (!hasLat || !hasLng)) {
      return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required when sort=distance"));
    }

    let lat = null;
    let lng = null;
    let distanceKm = null;
    if (sortIsDistance) {
      try {
        lat = parseFloatQueryParam(rawLat, "lat");
        lng = parseFloatQueryParam(rawLng, "lng");
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }
      if (lat === null || lng === null) {
        return jsonResponse(400, errorPayload("GEO_REQUIRED", "lat and lng are required when sort=distance"));
      }
      if (lat < -90 || lat > 90) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "lat must be between -90 and 90"));
      }
      if (lng < -180 || lng > 180) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "lng must be between -180 and 180"));
      }

      if (hasDistance) {
        try {
          distanceKm = parseIntegerQueryParam(rawDistance, "distance_km");
        } catch (error) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
        }
        if (distanceKm === null) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "distance_km must be an integer"));
        }
        if (distanceKm < 1 || distanceKm > 300) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "distance_km must be between 1 and 300"));
        }
      }
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

      if (sortIsDistance) {
        const cursorLat = cursor?.lat;
        const cursorLng = cursor?.lng;
        const cursorDistanceKm = cursor?.distance_km ?? null;
        const geoMatches =
          typeof cursorLat === "number" &&
          typeof cursorLng === "number" &&
          Math.abs(cursorLat - lat) < 1e-9 &&
          Math.abs(cursorLng - lng) < 1e-9 &&
          (cursorDistanceKm === null ? distanceKm === null : cursorDistanceKm === distanceKm);
        if (!geoMatches) {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "cursor does not match geo"));
        }
      }
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
        has_cursor: Boolean(rawCursor),
        has_geo: sortIsDistance,
        has_distance_km: distanceKm != null
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
        cursor,
        includeHidden: false,
        ...(sortIsDistance ? { geo: { lat, lng, distanceKm } } : {})
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
  const rawImages = body.images;
  const rawPhotos = body.photos;
  const hasCoverImageIndex = Object.prototype.hasOwnProperty.call(body, "cover_image_index");
  const rawCoverImageIndex = body.cover_image_index;
  const rawPublish = body.publish;
  const rawDealId = body.deal_id;
  const rawForceCreate = body.force_create;
  const rawDeliveryMethod = body.delivery_method;
  const rawMarketCode = body.market_code;

  let title;
  let description;
  let category;
  let condition;
  let priceAmount;
  let currency;
  let marketCode;
  let geo;
  let images;
  let coverImageIndex = null;
  let publish = true;
  let dealId = null;
  let forceCreate = false;
  let deliveryMethod = null;

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
    marketCode = resolveMarketCode({ marketCode: rawMarketCode, currency });
    assertNativeMarketCurrency(marketCode, currency);

    geo = parseGeo(rawGeo);

    const parsedImagesInput = parseListingsImagesInput({
      images: rawImages,
      photos: rawPhotos
    });
    images = parsedImagesInput.hasImages || parsedImagesInput.hasPhotos
      ? parsedImagesInput.images
      : null;

    const parsedCoverImageIndex = parseCoverImageIndex(rawCoverImageIndex);
    coverImageIndex = resolveCoverImageIndexForWrite({
      images,
      coverImageIndex: parsedCoverImageIndex,
      hasExplicitCoverField: hasCoverImageIndex
    });

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

    if (rawForceCreate !== undefined && rawForceCreate !== null) {
      if (typeof rawForceCreate !== "boolean") {
        throw new Error("force_create must be a boolean");
      }
      forceCreate = rawForceCreate;
    }

    if (rawDeliveryMethod !== undefined && rawDeliveryMethod !== null) {
      if (typeof rawDeliveryMethod !== "string") {
        throw new Error("delivery_method must be a string");
      }
      const dm = rawDeliveryMethod.trim().toUpperCase();
      if (!DELIVERY_METHODS.has(dm)) {
        throw new Error("delivery_method must be PICKUP, SHIPPING, or BOTH");
      }
      deliveryMethod = dm;
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

    let policyRecord: any = null;
    let policyDecision: any = { decision: POLICY_DECISION.N_A, policy_version: null };
    if (ownerId) {
      policyRecord = await getPolicyOrDefault(ownerId);
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

    const duplicateFingerprint = publish
      ? computeListingDuplicateFingerprint({
          title,
          category,
          priceAmount,
          geoLat: geo ? geo.lat : null,
          geoLng: geo ? geo.lng : null
        })
      : null;

    const existingDuplicate = duplicateFingerprint
      ? await findListingDuplicate({ fingerprint: duplicateFingerprint, marketCode })
      : null;

    if (existingDuplicate && !forceCreate) {
      if (ctx) {
        ctx.auditEvent = "listing.duplicate_detected";
        ctx.outcome = { type: "BLOCKED", reason: "duplicate" };
      }
      return jsonResponse(
        409,
        errorPayload("DUPLICATE_SUSPECTED", "A similar listing was recently created.", {
          existing_listing_id: existingDuplicate.listing_id,
          existing_created_at: existingDuplicate.created_at,
          existing_status: existingDuplicate.status
        })
      );
    }

    let forceDecision: any = null;
    let forceRequiresApproval = false;
    const duplicateOverride = Boolean(existingDuplicate && forceCreate);

    if (duplicateOverride) {
      if (!ownerId) {
        if (ctx) {
          ctx.outcome = { type: "BLOCKED", reason: "ownership" };
        }
        return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
      }

      forceDecision = evaluatePolicyAction({
        policy: policyRecord?.policy_json || {},
        action: "listing.force_create"
      });
      forceRequiresApproval = forceDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL;

      if (ctx) {
        ctx.policy = {
          decision: forceDecision.decision,
          policy_version: forceDecision.policy_version,
          approval_id: null
        };
      }
    }

    // Quarantined publish flows require an owner context so we can create an approval.
    // Without an ownerId, we'd create an unresolvable PENDING_APPROVAL listing.
    if (publish && quarantineApplied && !ownerId) {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "trust" };
      }
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }

    let status = !publish
      ? "DRAFT"
      : quarantineApplied || requiresApproval
        ? "PENDING_APPROVAL"
        : "LIVE";

    if (publish && duplicateOverride && forceRequiresApproval) {
      status = "PENDING_APPROVAL";
    }

    let listing: any;
    try {
      listing = await createListing({
      title,
      description,
      category,
      condition,
      status,
      priceAmount,
      currency,
      marketCode,
      geoLat: geo ? geo.lat : null,
      geoLng: geo ? geo.lng : null,
      photos: images,
      coverImageIndex,
      dealId,
      duplicateFingerprint,
      duplicateOverride,
      ownerId,
      agentId,
      sellerAgentId: agentId,
      deliveryMethod
    });
    } catch (error) {
      if (duplicateFingerprint && error?.code === "CONFLICT" && !duplicateOverride) {
        const dup = await findListingDuplicate({ fingerprint: duplicateFingerprint, marketCode });
        if (dup) {
          if (ctx) {
            ctx.auditEvent = "listing.duplicate_detected";
            ctx.outcome = { type: "BLOCKED", reason: "duplicate" };
          }
          return jsonResponse(
            409,
            errorPayload("DUPLICATE_SUSPECTED", "A similar listing was recently created.", {
              existing_listing_id: dup.listing_id,
              existing_created_at: dup.created_at,
              existing_status: dup.status
            })
          );
        }
      }
      throw error;
    }

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
        const approvalPolicyDecision =
          duplicateOverride && forceRequiresApproval && forceDecision ? forceDecision : policyDecision;
        ctx.policy = {
          decision: approvalPolicyDecision.decision,
          policy_version: approvalPolicyDecision.policy_version,
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

    const responseBody: any = {
      listing_id: listing.listing_id,
      status,
      market_code: listing.market_code || marketCode,
      currency: listing.currency || currency,
      delivery_method: listing.delivery_method || null,
      created_at: listing.created_at
    };

    if (status === "PENDING_APPROVAL") {
      responseBody.next_steps = {
        message: "Your listing requires approval before going live. Track its status in your approvals.",
        approvals_url: "/my/approvals"
      };
    }

    return jsonResponse(201, responseBody);
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
