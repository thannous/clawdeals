import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getOwner, invalidateOwnerChallenges, upsertOwner, updateOwnerProfile } from "../../../../server/services/owners";
import { isE164, normalizeEmail, normalizePhoneE164 } from "../../../../server/utils/owner-verification";

const PROFILE_FIELDS = ["display_name", "bio", "avatar_url", "city", "state_region", "country", "show_email", "available"] as const;

function getOwnerId(req) {
  const headerValue = req.headers["x-owner-id"];
  return Array.isArray(headerValue) ? headerValue[0] : headerValue;
}

function ownerSummary(owner) {
  return {
    owner_id: owner.owner_id,
    email_verified_at: owner.email_verified_at,
    phone_verified_at: owner.phone_verified_at,
    display_name: owner.display_name ?? null,
    bio: owner.bio ?? null,
    avatar_url: owner.avatar_url ?? null,
    city: owner.city ?? null,
    state_region: owner.state_region ?? null,
    country: owner.country ?? null,
    show_email: owner.show_email ?? false,
    available: owner.available ?? true,
  };
}

export async function handler(req) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return methodNotAllowed(["GET", "PATCH"]);
  }

  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id is required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }

  if (req.method === "GET") {
    try {
      const owner = await getOwner(ownerId);
      if (!owner) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Owner not found"));
      }
      return jsonResponse(200, { data: ownerSummary(owner) });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  const body = req.body || {};
  const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
  const hasPhone = Object.prototype.hasOwnProperty.call(body, "phone");
  const hasProfileFields = PROFILE_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(body, f));

  if (!hasEmail && !hasPhone && !hasProfileFields) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "At least one field is required"));
  }

  // --- Validate profile fields ---
  if (hasProfileFields) {
    if (body.display_name !== undefined && body.display_name !== null) {
      if (typeof body.display_name !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "display_name must be a string"));
      if (body.display_name.length < 1 || body.display_name.length > 60) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "display_name must be 1-60 characters"));
    }
    if (body.bio !== undefined && body.bio !== null) {
      if (typeof body.bio !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "bio must be a string"));
      if (body.bio.length > 2000) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "bio must be at most 2000 characters"));
    }
    if (body.avatar_url !== undefined && body.avatar_url !== null) {
      if (typeof body.avatar_url !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "avatar_url must be a string"));
      if (body.avatar_url.length > 500) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "avatar_url must be at most 500 characters"));
    }
    if (body.city !== undefined && body.city !== null) {
      if (typeof body.city !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "city must be a string"));
      if (body.city.length > 100) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "city must be at most 100 characters"));
    }
    if (body.state_region !== undefined && body.state_region !== null) {
      if (typeof body.state_region !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "state_region must be a string"));
      if (body.state_region.length > 100) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "state_region must be at most 100 characters"));
    }
    if (body.country !== undefined && body.country !== null) {
      if (typeof body.country !== "string") return jsonResponse(400, errorPayload("VALIDATION_ERROR", "country must be a string"));
      if (body.country.length > 2) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "country must be ISO 3166-1 alpha-2 (2 chars)"));
    }
    if (body.show_email !== undefined && typeof body.show_email !== "boolean") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "show_email must be a boolean"));
    }
    if (body.available !== undefined && typeof body.available !== "boolean") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "available must be a boolean"));
    }
  }

  let normalizedEmail;
  if (hasEmail) {
    if (body.email !== null && body.email !== undefined && typeof body.email !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email must be a string"));
    }
    normalizedEmail = normalizeEmail(body.email);
  }

  let normalizedPhone;
  if (hasPhone) {
    if (body.phone !== null && body.phone !== undefined && typeof body.phone !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "phone must be a string"));
    }
    normalizedPhone = normalizePhoneE164(body.phone);
    if (normalizedPhone && !isE164(normalizedPhone)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "phone must be E.164 format"));
    }
  }

  try {
    const existing = await getOwner(ownerId);
    let latest = existing;

    // --- Handle email/phone changes ---
    if (hasEmail || hasPhone) {
      const existingEmail = existing?.email ?? null;
      const existingPhone = existing?.phone_e164 ?? null;
      const nextEmail = hasEmail ? normalizedEmail ?? null : existingEmail;
      const nextPhone = hasPhone ? normalizedPhone ?? null : existingPhone;

      const emailChanged = hasEmail && nextEmail !== existingEmail;
      const phoneChanged = hasPhone && nextPhone !== existingPhone;

      latest = await upsertOwner({
        ownerId,
        email: nextEmail,
        phoneE164: nextPhone,
        emailVerifiedAt: emailChanged ? null : existing?.email_verified_at ?? null,
        phoneVerifiedAt: phoneChanged ? null : existing?.phone_verified_at ?? null
      });

      if (emailChanged) {
        await invalidateOwnerChallenges({ ownerId, type: "EMAIL" });
      }
      if (phoneChanged) {
        await invalidateOwnerChallenges({ ownerId, type: "PHONE" });
      }
    }

    // --- Handle profile field changes ---
    if (hasProfileFields) {
      latest = await updateOwnerProfile({
        ownerId,
        displayName: body.display_name,
        bio: body.bio,
        avatarUrl: body.avatar_url,
        city: body.city,
        stateRegion: body.state_region,
        country: body.country,
        showEmail: body.show_email,
        available: body.available,
      });
    }

    return jsonResponse(200, { data: ownerSummary(latest) });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
