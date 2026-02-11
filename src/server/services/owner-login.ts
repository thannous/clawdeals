import crypto from "node:crypto";

import { buildOwnerSessionCookie } from "../auth/session-cookie";
import { normalizeEmail, secondsUntil } from "../utils/owner-verification";
import { generateOwnerSessionToken, hashOwnerSessionToken, isOwnerSessionToken } from "../utils/session-tokens";
import { getOwner, getOwnerByEmail, setOwnerVerified, upsertOwner } from "./owners";
import {
  createOwnerSession,
  getOwnerSessionById,
  incrementOwnerSessionAttempt,
  markOwnerSessionActive,
  markOwnerSessionExpired,
  markOwnerSessionRevoked,
  touchOwnerSession
} from "./owner-sessions";

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_MAX_ATTEMPTS = 5;

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function resolveSessionTtlSeconds() {
  const raw = process.env.OWNER_SESSION_TTL_SECONDS;
  if (!raw) return DEFAULT_SESSION_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.floor(parsed);
}

function resolveMaxAttempts() {
  const raw = process.env.OWNER_SESSION_MAX_ATTEMPTS;
  if (!raw) return DEFAULT_MAX_ATTEMPTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ATTEMPTS;
  return Math.floor(parsed);
}

function timingSafeEqualString(a: string, b: string) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isSessionExpired(session: any, now = new Date()) {
  const expiresAt = session?.expires_at ? new Date(session.expires_at) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() <= now.getTime();
}

function isSessionLocked(session: any) {
  if (!session) return false;
  const attempts = Number(session.attempt_count || 0);
  const maxAttempts = Number(session.max_attempts || 0);
  return maxAttempts > 0 && attempts >= maxAttempts;
}

function lockoutError(session: any, now = new Date()) {
  const retryAfterSeconds = secondsUntil(session.expires_at, now);
  return buildServiceError("Login locked until session expires", 429, "SESSION_LOCKED", {
    retry_after_seconds: retryAfterSeconds
  });
}

export async function startOwnerLogin({
  email,
  ipTruncated,
  uaHash,
  now = new Date()
}: {
  email: string;
  ipTruncated?: string | null;
  uaHash?: string | null;
  now?: Date;
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw buildServiceError("email is required", 400, "VALIDATION_ERROR");
  }

  let owner = await getOwnerByEmail(normalizedEmail);
  if (!owner) {
    // Create a new owner account keyed by email login.
    // This enables self-serve onboarding without requiring x-owner-id.
    const ownerId = crypto.randomUUID();
    try {
      owner = await upsertOwner({
        ownerId,
        email: normalizedEmail,
        phoneE164: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        updatedAt: now
      });
    } catch (error: any) {
      // Race: if another request created it concurrently, fetch again.
      if (error?.code === "CONFLICT") {
        owner = await getOwnerByEmail(normalizedEmail);
      }
      if (!owner) {
        throw error;
      }
    }
  }

  if (owner.suspended_at) {
    throw buildServiceError("Owner account is suspended", 403, "OWNER_SUSPENDED");
  }

  const ttlSeconds = resolveSessionTtlSeconds();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const token = generateOwnerSessionToken();
  const tokenHash = hashOwnerSessionToken(token);

  const session = await createOwnerSession({
    ownerId: owner.owner_id,
    tokenHash,
    expiresAt,
    maxAttempts: resolveMaxAttempts(),
    ipTruncated,
    uaHash,
    now
  });

  return {
    owner,
    session,
    session_token: token
  };
}

export async function confirmOwnerLogin({
  sessionId,
  token,
  cookieSecure,
  now = new Date()
}: {
  sessionId: string;
  token: string;
  cookieSecure?: boolean;
  now?: Date;
}) {
  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId) {
    throw buildServiceError("sessionId is required", 400, "VALIDATION_ERROR");
  }

  const resolvedToken = normalizeNonEmptyString(token);
  if (!resolvedToken || !isOwnerSessionToken(resolvedToken)) {
    throw buildServiceError("Invalid session token", 400, "INVALID_SESSION_TOKEN");
  }

  const session = await getOwnerSessionById(resolvedSessionId);
  if (!session) {
    throw buildServiceError("Owner session not found", 404, "NOT_FOUND");
  }

  if (session.status === "REVOKED") {
    throw buildServiceError("Owner session revoked", 401, "SESSION_REVOKED");
  }

  if (session.status === "EXPIRED" || isSessionExpired(session, now)) {
    if (session.status !== "EXPIRED") {
      try {
        await markOwnerSessionExpired(resolvedSessionId, now);
      } catch {
        // Best-effort only.
      }
    }
    throw buildServiceError("Owner session expired", 410, "SESSION_EXPIRED");
  }

  if (isSessionLocked(session)) {
    throw lockoutError(session, now);
  }

  const tokenHash = hashOwnerSessionToken(resolvedToken);
  if (!timingSafeEqualString(tokenHash, session.token_hash)) {
    const currentAttempts = Number(session.attempt_count || 0);
    const nextAttempts = currentAttempts + 1;
    const updated = await incrementOwnerSessionAttempt(resolvedSessionId, nextAttempts, now);
    if (isSessionLocked(updated)) {
      throw lockoutError(updated, now);
    }

    const updatedAttempts = Number(updated.attempt_count || nextAttempts);
    throw buildServiceError("Invalid session token", 400, "INVALID_SESSION_TOKEN", {
      remaining_attempts: Math.max(0, Number(updated.max_attempts || 0) - updatedAttempts)
    });
  }

  let owner = await getOwner(session.owner_id);
  if (!owner) {
    try {
      await markOwnerSessionRevoked(resolvedSessionId, now);
    } catch {
      // Best-effort only.
    }
    throw buildServiceError("Owner not found", 404, "NOT_FOUND");
  }

  if (owner.suspended_at) {
    try {
      await markOwnerSessionRevoked(resolvedSessionId, now);
    } catch {
      // Best-effort only.
    }
    throw buildServiceError("Owner account is suspended", 403, "OWNER_SUSPENDED");
  }

  let active = session.status === "ACTIVE"
    ? await touchOwnerSession(resolvedSessionId, now)
    : await markOwnerSessionActive(resolvedSessionId, now);
  if (!active) {
    // State changed (race): re-fetch to determine current status.
    active = await getOwnerSessionById(resolvedSessionId);
  }
  if (!active) {
    throw buildServiceError("Owner session not found", 404, "NOT_FOUND");
  }
  if (active.status === "REVOKED") {
    throw buildServiceError("Owner session revoked", 401, "SESSION_REVOKED");
  }
  if (active.status === "EXPIRED" || isSessionExpired(active, now)) {
    if (active.status !== "EXPIRED") {
      try {
        await markOwnerSessionExpired(resolvedSessionId, now);
      } catch {
        // Best-effort only.
      }
    }
    throw buildServiceError("Owner session expired", 410, "SESSION_EXPIRED");
  }
  if (active.status !== "ACTIVE") {
    throw buildServiceError("Owner session not active", 401, "SESSION_INACTIVE");
  }
  const expiresAt = active.expires_at ? new Date(active.expires_at) : new Date(now.getTime());

  // Email login proves control of the mailbox; treat it as email verification for trustscore.
  if (!owner.email_verified_at) {
    try {
      owner = await setOwnerVerified({ ownerId: owner.owner_id, type: "EMAIL", verifiedAt: now });
    } catch {
      // Best-effort only: session issuance should not depend on profile update.
    }
  }

  return {
    owner,
    session: active,
    set_cookie: buildOwnerSessionCookie({
      token: resolvedToken,
      expiresAt,
      secure: cookieSecure
    })
  };
}
