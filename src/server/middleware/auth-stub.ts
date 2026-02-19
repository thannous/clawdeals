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

function readTrustedIdentity(req: any) {
  const identity = req?.__clawdealsTrustedIdentity;
  if (!identity || typeof identity !== "object") return null;

  const agentIdRaw = (identity as any).agentId;
  const ownerIdRaw = (identity as any).ownerId;

  const agentId = typeof agentIdRaw === "string" && agentIdRaw ? agentIdRaw : null;
  const ownerId = typeof ownerIdRaw === "string" && ownerIdRaw ? ownerIdRaw : null;

  if (!agentId && !ownerId) return null;
  return { agentId, ownerId };
}

function isProductionNodeEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function readLegacyHeaderIdentity(req: any) {
  const agentIdRaw = safeHeader(req, "x-agent-id");
  const ownerIdRaw = safeHeader(req, "x-owner-id");

  const agentId = typeof agentIdRaw === "string" && agentIdRaw ? agentIdRaw : null;
  const ownerId = typeof ownerIdRaw === "string" && ownerIdRaw ? ownerIdRaw : null;
  if (!agentId && !ownerId) return null;
  return { agentId, ownerId };
}

function readEffectiveIdentity(req: any) {
  const trustedIdentity = readTrustedIdentity(req);
  if (trustedIdentity) return trustedIdentity;

  // Keep a compatibility bridge for local/dev tooling that still uses x-owner-id/x-agent-id.
  // Production traffic must never trust caller-supplied identity headers.
  if (!isProductionNodeEnv()) {
    return readLegacyHeaderIdentity(req);
  }
  return null;
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

function resolveApiKeyAuthError(reason) {
  if (reason === "revoked") {
    return { status: 401, code: "API_KEY_REVOKED", message: "API key revoked" };
  }
  if (reason === "expired") {
    return { status: 401, code: "API_KEY_EXPIRED", message: "API key expired" };
  }
  return { status: 401, code: "UNAUTHORIZED", message: "Invalid API key" };
}

function resolveOauthAccessTokenAuthError(reason) {
  if (reason === "revoked") {
    return { status: 401, code: "TOKEN_REVOKED", message: "Access token revoked" };
  }
  if (reason === "expired") {
    return { status: 401, code: "TOKEN_EXPIRED", message: "Access token expired" };
  }
  return { status: 401, code: "UNAUTHORIZED", message: "Invalid access token" };
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
      ctx.authError = resolveApiKeyAuthError(result?.reason);
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
      ctx.authError = resolveOauthAccessTokenAuthError(result?.reason);
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

  const trustedIdentity = readEffectiveIdentity(req);
  ctx.agentId = trustedIdentity?.agentId || null;
  ctx.ownerId = trustedIdentity?.ownerId || null;
  if (ctx.agentId) {
    ctx.actor = { type: "agent", id: ctx.agentId };
  } else if (ctx.ownerId) {
    ctx.actor = { type: "owner", id: ctx.ownerId };
  } else {
    ctx.actor = { type: "anonymous", id: null };
  }
  return ctx;
}
