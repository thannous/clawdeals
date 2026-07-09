import { readOwnerSessionCookie } from "../auth/session-cookie";
import {
  getOwnerSessionByTokenHash,
  markOwnerSessionExpired,
  markOwnerSessionRevoked,
  touchOwnerSession
} from "../services/owner-sessions";
import { getOwner } from "../services/owners";
import { hashOwnerSessionToken, isOwnerSessionToken } from "../utils/session-tokens";

const DEFAULT_CONSOLE_OPS_OWNER_ID = "00000000-0000-4000-a000-000000000000";
const OWNER_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function setHeader(headers, name, value) {
  if (!headers) return;
  headers[String(name).toLowerCase()] = value;
}

function isProductionNodeEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isEnabledFlag(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function respondNotFound(res) {
  const payload = { error: { code: "NOT_FOUND", message: "Not found" } };
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(404).json(payload);
  }
  if (res) {
    res.statusCode = 404;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
    }
    if (typeof res.end === "function") {
      res.end(JSON.stringify(payload));
    }
  }
  return null;
}

function respondJsonError(res, status, code, message) {
  const payload = { error: { code, message } };
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  if (res) {
    res.statusCode = status;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
    }
    if (typeof res.end === "function") {
      res.end(JSON.stringify(payload));
    }
  }
  return null;
}

function resolveConsoleOpsOwnerId(options: any) {
  const configuredOwnerId = normalizeNonEmptyString(options.ownerId) || normalizeNonEmptyString(process.env.CONSOLE_OPS_OWNER_ID);
  if (configuredOwnerId) return configuredOwnerId;
  return isProductionNodeEnv() ? null : DEFAULT_CONSOLE_OPS_OWNER_ID;
}

async function markSessionExpiredBestEffort(sessionId, now) {
  if (!sessionId) return;
  try {
    await markOwnerSessionExpired(sessionId, now);
  } catch {
    // Best-effort only.
  }
}

async function markSessionRevokedBestEffort(sessionId, now) {
  if (!sessionId) return;
  try {
    await markOwnerSessionRevoked(sessionId, now);
  } catch {
    // Best-effort only.
  }
}

async function touchSessionBestEffort(session, now, nowMs) {
  const sessionId = normalizeNonEmptyString(session?.session_id);
  if (!sessionId) return;

  try {
    const lastUsedAt = session?.last_used_at ? new Date(session.last_used_at) : null;
    const shouldTouch =
      !lastUsedAt ||
      Number.isNaN(lastUsedAt.getTime()) ||
      nowMs - lastUsedAt.getTime() >= OWNER_SESSION_TOUCH_INTERVAL_MS;

    if (shouldTouch) {
      await touchOwnerSession(sessionId, now);
    }
  } catch {
    // Best-effort only.
  }
}

async function requireProductionConsoleOpsSession(req, res, allowedOwnerId) {
  if (!allowedOwnerId) {
    return { ok: false, response: respondJsonError(res, 403, "FORBIDDEN", "Console ops owner allowlist not configured") };
  }

  const sessionToken = readOwnerSessionCookie(req);
  if (!sessionToken) {
    return { ok: false, response: respondJsonError(res, 401, "UNAUTHORIZED", "Owner session required") };
  }

  if (!isOwnerSessionToken(sessionToken)) {
    return { ok: false, response: respondJsonError(res, 401, "UNAUTHORIZED", "Invalid session cookie") };
  }

  try {
    const tokenHash = hashOwnerSessionToken(sessionToken);
    const session = await getOwnerSessionByTokenHash(tokenHash);
    if (!session) {
      return { ok: false, response: respondJsonError(res, 401, "UNAUTHORIZED", "Invalid session cookie") };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const sessionId = normalizeNonEmptyString(session.session_id);
    const expiresAt = session?.expires_at ? new Date(session.expires_at) : null;
    const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= nowMs;

    if (session.status === "REVOKED") {
      return { ok: false, response: respondJsonError(res, 401, "SESSION_REVOKED", "Session revoked") };
    }

    if (session.status === "EXPIRED" || expired) {
      if (session.status !== "EXPIRED") {
        await markSessionExpiredBestEffort(sessionId, now);
      }
      return { ok: false, response: respondJsonError(res, 401, "SESSION_EXPIRED", "Session expired") };
    }

    if (session.status !== "ACTIVE") {
      return { ok: false, response: respondJsonError(res, 401, "SESSION_INACTIVE", "Session not active") };
    }

    const sessionOwnerId = normalizeNonEmptyString(session.owner_id);
    if (!sessionOwnerId) {
      return { ok: false, response: respondJsonError(res, 401, "UNAUTHORIZED", "Invalid session cookie") };
    }

    const owner = await getOwner(sessionOwnerId);
    if (!owner) {
      await markSessionRevokedBestEffort(sessionId, now);
      return { ok: false, response: respondJsonError(res, 401, "UNAUTHORIZED", "Invalid session cookie") };
    }

    if (owner.suspended_at) {
      await markSessionRevokedBestEffort(sessionId, now);
      return { ok: false, response: respondJsonError(res, 403, "OWNER_SUSPENDED", "Owner account is suspended") };
    }

    const ownerId = normalizeNonEmptyString(owner.owner_id) || sessionOwnerId;
    if (ownerId !== allowedOwnerId) {
      return { ok: false, response: respondJsonError(res, 403, "FORBIDDEN", "Console ops owner required") };
    }

    await touchSessionBestEffort(session, now, nowMs);
    return { ok: true, ownerId };
  } catch (error: any) {
    return {
      ok: false,
      response: respondJsonError(res, error.status || 503, error.code || "ERROR", error.message || "Authentication failed")
    };
  }
}

/**
 * Console endpoints are called by the browser. Local/dev flows keep the legacy
 * server-side injection, while production requires a real allowlisted owner session.
 */
export function injectConsoleOpsOwner(apiHandler: any, options: any = {}) {
  const ownerId = resolveConsoleOpsOwnerId(options);

  return async function consoleOpsOwnerInjected(req, res) {
    // Avoid accidentally shipping unauthenticated console ops endpoints in production.
    if (isProductionNodeEnv()) {
      if (!isEnabledFlag(process.env.CONSOLE_OPS_ENABLED)) {
        return respondNotFound(res);
      }

      const sessionResult: any = await requireProductionConsoleOpsSession(req, res, ownerId);
      if (!sessionResult.ok) {
        return sessionResult.response;
      }
    }

    if (!req.headers) {
      req.headers = {};
    }

    // Always override user-provided identity headers for console operations.
    setHeader(req.headers, "x-owner-id", ownerId);

    // Mark identity as server-injected so auth middleware never trusts raw client headers.
    (req as any).__clawdealsTrustedIdentity = {
      ownerId
    };

    return apiHandler(req, res);
  };
}
