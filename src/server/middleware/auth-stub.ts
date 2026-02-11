import { authenticateApiKey } from "../services/api-keys";
import { authenticateOauthAccessToken, isOauthAccessToken } from "../services/oauth-access-tokens";
import { parseApiKey, parseApiKeyAnyNamespace } from "../utils/api-keys";
import { readOwnerSessionCookie } from "../auth/session-cookie";
import {
  getOwnerSessionByTokenHash,
  markOwnerSessionExpired,
  markOwnerSessionRevoked,
  touchOwnerSession
} from "../services/owner-sessions";
import { getOwner } from "../services/owners";
import { hashOwnerSessionToken, isOwnerSessionToken } from "../utils/session-tokens";

const OWNER_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function safeHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBearerToken(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

export async function applyAuthStub(req, ctx) {
  ctx.authError = null;

  const authHeader = safeHeader(req, "authorization");
  const apiKeyHeader = safeHeader(req, "x-clawdeals-api-key");

  // Prefer Authorization when present, fall back to the explicit API key header.
  const rawToken = authHeader ? parseBearerToken(authHeader) : apiKeyHeader;

  if (authHeader && !rawToken) {
    ctx.authError = {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid Authorization header"
    };
    return ctx;
  }

  if (rawToken && parseApiKey(rawToken)) {
    try {
      const result = await authenticateApiKey(rawToken);
      if (result?.ok) {
        if (result.suspendedAt) {
          ctx.authError = { status: 403, code: "AGENT_SUSPENDED", message: "Agent account is suspended" };
          return ctx;
        }
        ctx.agentId = result.agentId;
        ctx.ownerId = result.ownerId || null;
        ctx.installationId = result.installationId || null;
        ctx.apiKeyId = result.apiKeyId;
        ctx.apiKeyState = result.keyState;
        ctx.actor = { type: "agent", id: result.agentId };
        return ctx;
      }
      ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid API key" };
      return ctx;
    } catch (error) {
      ctx.authError = {
        status: error.status || 500,
        code: error.code || "ERROR",
        message: error.message || "Authentication failed"
      };
      return ctx;
    }
  }

  // If the token looks like an API key but doesn't match the configured namespace,
  // fail closed instead of silently falling back to header-based stub auth.
  if (rawToken && parseApiKeyAnyNamespace(rawToken)) {
    ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid API key" };
    return ctx;
  }

  if (rawToken && isOauthAccessToken(rawToken)) {
    try {
      const result = await authenticateOauthAccessToken(rawToken);
      if (result?.ok) {
        ctx.agentId = result.agentId;
        ctx.ownerId = result.ownerId || null;
        ctx.installationId = result.installationId || null;
        ctx.oauthScopes = result.scopes || [];
        ctx.actor = { type: "agent", id: result.agentId };
        return ctx;
      }
      ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid access token" };
      return ctx;
    } catch (error) {
      ctx.authError = {
        status: error.status || 503,
        code: error.code || "ERROR",
        message: error.message || "Authentication failed"
      };
      return ctx;
    }
  }

  const sessionToken = readOwnerSessionCookie(req);
  if (sessionToken) {
    if (!isOwnerSessionToken(sessionToken)) {
      ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid session cookie" };
      return ctx;
    }
    try {
      const tokenHash = hashOwnerSessionToken(sessionToken);
      const session = await getOwnerSessionByTokenHash(tokenHash);
      if (!session) {
        ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid session cookie" };
        return ctx;
      }

      const now = new Date();
      const nowMs = now.getTime();

      const expiresAt = session?.expires_at ? new Date(session.expires_at) : null;
      const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= nowMs;

      if (session.status === "REVOKED") {
        ctx.authError = { status: 401, code: "SESSION_REVOKED", message: "Session revoked" };
        return ctx;
      }

      if (session.status === "EXPIRED" || expired) {
        if (session.status !== "EXPIRED" && session.session_id) {
          try {
            await markOwnerSessionExpired(session.session_id, now);
          } catch {
            // Best-effort only.
          }
        }
        ctx.authError = { status: 401, code: "SESSION_EXPIRED", message: "Session expired" };
        return ctx;
      }

      if (session.status !== "ACTIVE") {
        ctx.authError = { status: 401, code: "SESSION_INACTIVE", message: "Session not active" };
        return ctx;
      }

      const ownerId = session.owner_id || null;
      if (!ownerId) {
        ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid session cookie" };
        return ctx;
      }

      const owner = await getOwner(ownerId);
      if (!owner) {
        if (session.session_id) {
          try {
            await markOwnerSessionRevoked(session.session_id, now);
          } catch {
            // Best-effort only.
          }
        }
        ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Invalid session cookie" };
        return ctx;
      }

      if (owner.suspended_at) {
        if (session.session_id) {
          try {
            await markOwnerSessionRevoked(session.session_id, now);
          } catch {
            // Best-effort only.
          }
        }
        ctx.authError = { status: 403, code: "OWNER_SUSPENDED", message: "Owner account is suspended" };
        return ctx;
      }

      if (session.session_id) {
        try {
          const lastUsedAt = session?.last_used_at ? new Date(session.last_used_at) : null;
          const shouldTouch =
            !lastUsedAt ||
            Number.isNaN(lastUsedAt.getTime()) ||
            nowMs - lastUsedAt.getTime() >= OWNER_SESSION_TOUCH_INTERVAL_MS;

          if (shouldTouch) {
            await touchOwnerSession(session.session_id, now);
          }
        } catch {
          // Best-effort only.
        }
      }

      ctx.ownerId = owner.owner_id || null;
      ctx.ownerSessionId = session.session_id || null;
      ctx.actor = { type: "owner", id: owner.owner_id || null };
      return ctx;
    } catch (error: any) {
      ctx.authError = {
        status: error.status || 503,
        code: error.code || "ERROR",
        message: error.message || "Authentication failed"
      };
      return ctx;
    }
  }

  const agentId = safeHeader(req, "x-agent-id");
  const ownerId = safeHeader(req, "x-owner-id");
  ctx.agentId = agentId || null;
  ctx.ownerId = ownerId || null;
  if (agentId) {
    ctx.actor = { type: "agent", id: agentId };
  } else if (ownerId) {
    ctx.actor = { type: "owner", id: ownerId };
  } else {
    ctx.actor = { type: "anonymous", id: null };
  }
  return ctx;
}
