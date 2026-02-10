import { authenticateApiKey } from "../services/api-keys";
import { authenticateOauthAccessToken, isOauthAccessToken } from "../services/oauth-access-tokens";
import { parseApiKey, parseApiKeyAnyNamespace } from "../utils/api-keys";

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
