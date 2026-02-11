import { buildOwnerSessionCookie } from "../auth/session-cookie";
import { createOwnerSession, getOwnerSessionById, markOwnerSessionActive } from "./owner-sessions";
import { generateOwnerSessionToken, hashOwnerSessionToken } from "../utils/session-tokens";
import { isUuid } from "../utils/validators";

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_MAX_ATTEMPTS = 5;

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

export async function issueTrustedOwnerSession({
  ownerId,
  cookieSecure,
  ipTruncated,
  uaHash,
  now = new Date()
}: {
  ownerId: string;
  cookieSecure?: boolean;
  ipTruncated?: string | null;
  uaHash?: string | null;
  now?: Date;
}) {
  if (!ownerId || !isUuid(ownerId)) {
    throw buildServiceError("ownerId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const token = generateOwnerSessionToken();
  const tokenHash = hashOwnerSessionToken(token);
  const ttlSeconds = resolveSessionTtlSeconds();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const pendingSession = await createOwnerSession({
    ownerId,
    tokenHash,
    expiresAt,
    maxAttempts: resolveMaxAttempts(),
    ipTruncated: ipTruncated || null,
    uaHash: uaHash || null,
    now
  });

  let active = await markOwnerSessionActive(pendingSession.session_id, now);
  if (!active && pendingSession?.session_id) {
    active = await getOwnerSessionById(pendingSession.session_id);
  }

  if (!active || active.status !== "ACTIVE") {
    throw buildServiceError("Failed to activate owner session", 500, "SESSION_ACTIVATION_FAILED");
  }

  return {
    session: active,
    session_token: token,
    set_cookie: buildOwnerSessionCookie({
      token,
      expiresAt,
      secure: cookieSecure
    })
  };
}
