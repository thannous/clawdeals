import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { isUuid } from "../../../server/utils/validators";
import {
  OWNER_VERIFICATION,
  computeExpiryDate,
  generateEmailToken,
  generatePhoneOtp,
  hashToken,
  normalizePhoneE164,
  secondsUntil,
  verifyTokenHash
} from "../../../server/utils/owner-verification";
import { getOwner, setOwnerVerified } from "../../../server/services/owners";
import {
  consumeChallenge,
  createChallenge,
  evaluateChallenge,
  getLatestActiveChallenge,
  incrementChallengeAttempt
} from "../../../server/services/owner-verification";

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

function shouldEchoToken() {
  if (process.env.OWNER_VERIFICATION_ECHO_TOKEN === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function lockoutResponse(retryAfterSeconds) {
  return jsonResponse(
    429,
    errorPayload("CHALLENGE_LOCKED", "Verification locked until challenge expires", {
      retry_after_seconds: retryAfterSeconds
    }),
    { "Retry-After": String(retryAfterSeconds) }
  );
}

async function handleStart(req, ctx, { type, tokenKind, eventName }) {
  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id is required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }

  const owner = await getOwner(ownerId);
  if (!owner) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Owner not found"));
  }

  if (type === "EMAIL" && !owner.email) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is required"));
  }
  if (type === "PHONE") {
    const phone = normalizePhoneE164(owner.phone_e164);
    if (!phone) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "phone is required"));
    }
  }

  const now = new Date();
  const existing = await getLatestActiveChallenge(ownerId, type);
  if (existing) {
    const state = evaluateChallenge(existing, now);
    if (state.status === "locked") {
      return lockoutResponse(state.retryAfterSeconds);
    }
    if (state.status === "active") {
      await consumeChallenge(existing.challenge_id, now);
    }
  }

  const token = type === "EMAIL" ? generateEmailToken() : generatePhoneOtp();
  const tokenHash = await hashToken(token);
  const expirySeconds =
    type === "EMAIL" ? OWNER_VERIFICATION.emailExpirySeconds : OWNER_VERIFICATION.phoneExpirySeconds;
  const expiresAt = computeExpiryDate(expirySeconds, now);

  const challenge = await createChallenge({
    ownerId,
    type,
    tokenHash,
    expiresAt,
    maxAttempts: OWNER_VERIFICATION.maxAttempts
  });

  ctx.auditEvent = eventName;

  const data = {
    challenge_id: challenge.challenge_id,
    expires_at: challenge.expires_at
  };

  if (shouldEchoToken()) {
    data[tokenKind] = token;
  }

  return jsonResponse(201, { data });
}

async function handleConfirm(req, ctx, { type, tokenField, eventName }) {
  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id is required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }

  const owner = await getOwner(ownerId);
  if (!owner) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Owner not found"));
  }

  const body = req.body || {};
  const token = body[tokenField];
  if (!token || typeof token !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", `${tokenField} is required`));
  }

  const challenge = await getLatestActiveChallenge(ownerId, type);
  if (!challenge) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Verification challenge not found"));
  }

  const now = new Date();
  const state = evaluateChallenge(challenge, now);
  if (state.status === "locked") {
    return lockoutResponse(state.retryAfterSeconds);
  }
  if (state.status === "expired") {
    return jsonResponse(409, errorPayload("CHALLENGE_EXPIRED", "Verification challenge expired"));
  }
  if (state.status === "consumed") {
    return jsonResponse(409, errorPayload("CHALLENGE_CONSUMED", "Verification challenge already used"));
  }

  const matches = await verifyTokenHash(token, challenge.token_hash);
  if (!matches) {
    const currentAttempts = Number(challenge.attempt_count || 0);
    const nextAttempts = currentAttempts + 1;
    const updated = await incrementChallengeAttempt(challenge.challenge_id, nextAttempts);
    if (nextAttempts >= Number(updated.max_attempts || 0)) {
      const retryAfterSeconds = secondsUntil(updated.expires_at, now);
      return lockoutResponse(retryAfterSeconds);
    }

    return jsonResponse(
      400,
      errorPayload("INVALID_TOKEN", "Invalid verification token", {
        remaining_attempts: Math.max(0, Number(updated.max_attempts || 0) - nextAttempts)
      })
    );
  }

  await consumeChallenge(challenge.challenge_id, now);
  const verifiedOwner = await setOwnerVerified({ ownerId, type, verifiedAt: now });

  ctx.auditEvent = eventName;

  return jsonResponse(200, { data: ownerSummary(verifiedOwner) });
}

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const rawAction = req.query?.action;
  const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;

  switch (action) {
    case "verify-email:start":
      return handleStart(req, ctx, {
        type: "EMAIL",
        tokenKind: "token",
        eventName: "owner.email_verification_started"
      });
    case "verify-email:confirm":
      return handleConfirm(req, ctx, {
        type: "EMAIL",
        tokenField: "token",
        eventName: "owner.email_verified"
      });
    case "verify-phone:start":
      return handleStart(req, ctx, {
        type: "PHONE",
        tokenKind: "code",
        eventName: "owner.phone_verification_started"
      });
    case "verify-phone:confirm":
      return handleConfirm(req, ctx, {
        type: "PHONE",
        tokenField: "code",
        eventName: "owner.phone_verified"
      });
    default:
      return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown owner action"));
  }
}

export default withApiMiddlewares(handler);
