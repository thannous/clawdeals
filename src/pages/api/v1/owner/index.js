import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors.js";
import { isUuid } from "../../../../server/utils/validators";
import { getOwner, invalidateOwnerChallenges, upsertOwner } from "../../../../server/services/owners";
import { isE164, normalizeEmail, normalizePhoneE164 } from "../../../../server/utils/owner-verification";

function getOwnerId(req) {
  const headerValue = req.headers["x-owner-id"];
  return Array.isArray(headerValue) ? headerValue[0] : headerValue;
}

function ownerSummary(owner) {
  return {
    owner_id: owner.owner_id,
    email_verified_at: owner.email_verified_at,
    phone_verified_at: owner.phone_verified_at
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

  if (!hasEmail && !hasPhone) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email or phone is required"));
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
    const existingEmail = existing?.email ?? null;
    const existingPhone = existing?.phone_e164 ?? null;
    const nextEmail = hasEmail ? normalizedEmail ?? null : existingEmail;
    const nextPhone = hasPhone ? normalizedPhone ?? null : existingPhone;

    const emailChanged = hasEmail && nextEmail !== existingEmail;
    const phoneChanged = hasPhone && nextPhone !== existingPhone;

    const owner = await upsertOwner({
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

    return jsonResponse(200, { data: ownerSummary(owner) });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
