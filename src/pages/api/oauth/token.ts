import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import {
  getOauthDeviceAuthorizationByDeviceCode,
  markOauthDeviceAuthorizationExchanged
} from "../../../server/services/oauth-device-authorizations";
import { createAgentInstallation, deleteAgentInstallation } from "../../../server/services/agent-installations";
import {
  getOauthRefreshTokenRecordByToken,
  issueRefreshTokenRecord,
  rotateRefreshToken
} from "../../../server/services/oauth-refresh-tokens";
import {
  deleteOauthAccessTokenByHash,
  issueOauthAccessToken
} from "../../../server/services/oauth-access-tokens";

const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function normalizeScope(value: any): string[] {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTokenBody(req: any) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === "object") return body;
  if (typeof body !== "string") return {};

  const contentType = String(getHeaderValue(req, "content-type") || "");

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  try {
    const params = new URLSearchParams(body);
    const out: any = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function sanitizeCtxBody(ctx: any, body: any) {
  if (!ctx) return;
  if (!body || typeof body !== "object") {
    ctx.body = {};
    return;
  }
  const copy: any = { ...body };
  delete copy.device_code;
  delete copy.deviceCode;
  delete copy.refresh_token;
  delete copy.refreshToken;
  delete copy.token;
  ctx.body = copy;
}

function applyRateLimitResultToCtx(ctx: any, meta: any) {
  if (!ctx || !meta) return;
  ctx.rateLimit = {
    group: meta.group,
    scope: meta.scope,
    identity: meta.identity,
    limit: meta.limit,
    windowSeconds: meta.windowSeconds,
    retryAfterSeconds: meta.retryAfterSeconds,
    remaining: meta.remaining,
    resetSeconds: meta.resetSeconds
  };
}

function oauthError(code: string, message: string, status: number) {
  return jsonResponse(status, {
    error: {
      code,
      message
    }
  });
}

function invalidGrant(message = "Invalid grant") {
  return oauthError("invalid_grant", message, 401);
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const body = parseTokenBody(req);
  sanitizeCtxBody(ctx, body);

  const clientIdRaw = body.client_id ?? body.clientId ?? null;
  const clientId = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
  if (!clientId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id is required"));
  }
  if (clientId !== "openclaw") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id must be 'openclaw'"));
  }

  const grantTypeRaw = body.grant_type ?? body.grantType ?? null;
  const grantType = typeof grantTypeRaw === "string" ? grantTypeRaw.trim() : "";
  if (!grantType) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "grant_type is required"));
  }

  if (grantType === DEVICE_CODE_GRANT_TYPE) {
    if (ctx) {
      ctx.auditEvent = "oauth.token_issued";
    }

    const rateLimitResult = await rateLimitMiddleware(req, {
      routeGroup: "oauth.token",
      ip: ctx?.ip,
      env: process.env,
      onRateLimited: (meta: any) => applyRateLimitResultToCtx(ctx, meta)
    });

    if (rateLimitResult && rateLimitResult.status === 429) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
      return jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
    }

    const deviceCode = normalizeNonEmptyString(body.device_code ?? body.deviceCode);
    if (!deviceCode) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "device_code is required"));
    }

    let authorization: any;
    try {
      authorization = await getOauthDeviceAuthorizationByDeviceCode({ deviceCode, now: new Date() });
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }
      return invalidGrant();
    }

    const now = new Date();
    const expiresAt = authorization?.expires_at ? new Date(authorization.expires_at) : null;
    const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();

    if (authorization?.status === "PENDING") {
      return oauthError("authorization_pending", "Authorization pending", 400);
    }
    if (authorization?.status === "DENIED") {
      return invalidGrant("Device authorization denied");
    }
    if (authorization?.status === "EXPIRED" || expired) {
      return invalidGrant("Device authorization expired");
    }
    if (authorization?.status !== "AUTHORIZED") {
      return invalidGrant();
    }
    if (authorization?.exchanged_at) {
      return invalidGrant("Device code already exchanged");
    }

    const ownerId = normalizeNonEmptyString(authorization?.owner_id);
    const agentId = normalizeNonEmptyString(authorization?.agent_id);
    if (!ownerId || !agentId) {
      return invalidGrant();
    }

    const scopes = Array.isArray(authorization.requested_scopes) ? authorization.requested_scopes : [];

    let installation: any = null;
    let accessToken: any = null;
    try {
      installation = await createAgentInstallation({
        ownerId,
        agentId,
        clientType: "openclaw",
        clientVersion: null,
        deviceName: normalizeNonEmptyString(authorization.requested_agent_name),
        fingerprint: null,
        now
      });

      const refresh = await issueRefreshTokenRecord({
        ownerId,
        agentId,
        installationId: installation.installation_id,
        scopes,
        now
      });

      accessToken = await issueOauthAccessToken({
        ownerId,
        agentId,
        installationId: installation.installation_id,
        scopes: normalizeScope(scopes.join(" ")),
        now
      });

      // Single-use exchange: only one successful issuance per device_code.
      await markOauthDeviceAuthorizationExchanged({
        authorizationId: authorization.authorization_id,
        deviceCode,
        now
      });

      if (ctx) {
        ctx.auditEntityType = "oauth_refresh_token";
        ctx.auditEntityId = refresh.token_id;
        ctx.security = {
          ...(ctx.security || {}),
          authorization_id: authorization.authorization_id || null,
          client_id: authorization.client_id || null,
          device_code_hash: authorization.device_code_hash || null,
          installation_id: installation.installation_id || null,
          refresh_token_id: refresh.token_id || null,
          refresh_token_hash: refresh.token_hash || null,
          access_token_hash: accessToken.access_token_hash || null
        };
      }

      return jsonResponse(200, {
        access_token: accessToken.access_token,
        token_type: "Bearer",
        expires_in: accessToken.expires_in,
        refresh_token: refresh.refresh_token,
        scope: normalizeScope(scopes.join(" ")).join(" ")
      });
    } catch (error: any) {
      // Best-effort cleanup: if we fail after creating an installation (and downstream tokens),
      // delete the installation (cascades refresh tokens) and delete the Redis access token.
      if (accessToken?.access_token_hash) {
        await deleteOauthAccessTokenByHash(accessToken.access_token_hash);
      }
      if (installation?.installation_id) {
        await deleteAgentInstallation(installation.installation_id);
      }

      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }

      return invalidGrant();
    }
  }

  if (grantType === "refresh_token") {
    if (ctx) {
      ctx.auditEvent = "oauth.token_refreshed";
    }

    const refreshToken = normalizeNonEmptyString(body.refresh_token ?? body.refreshToken);
    if (!refreshToken) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "refresh_token is required"));
    }

    let existing: any;
    let existingTokenHash: string | null = null;
    try {
      const found = await getOauthRefreshTokenRecordByToken({ refreshToken });
      existing = found?.record || null;
      existingTokenHash = found?.tokenHash || null;
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }
      return invalidGrant();
    }

    if (!existing) {
      return invalidGrant();
    }
    if (existing.revoked_at) {
      return invalidGrant();
    }
    const now = new Date();
    const expiresAt = existing?.expires_at ? new Date(existing.expires_at) : null;
    const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
    if (expired) {
      return invalidGrant();
    }

    const rateLimitResult = await rateLimitMiddleware(req, {
      routeGroup: "oauth.token",
      agentId: existing.installation_id,
      useIpFallback: false,
      ip: ctx?.ip,
      env: process.env,
      onRateLimited: (meta: any) => applyRateLimitResultToCtx(ctx, meta)
    });

    if (rateLimitResult && rateLimitResult.status === 429) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
      return jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
    }

    let accessToken: any = null;
    try {
      accessToken = await issueOauthAccessToken({
        ownerId: existing.owner_id || null,
        agentId: existing.agent_id,
        installationId: existing.installation_id,
        scopes: normalizeScope((Array.isArray(existing.scopes) ? existing.scopes : []).join(" ")),
        now
      });

      // Rotate after access-token issuance. This prevents "refresh token lockout" when access issuance
      // transiently fails (e.g. Redis outage) and the client never receives the new refresh token.
      let rotated: any = null;
      try {
        rotated = await rotateRefreshToken({ refreshToken, now });
      } catch (rotateError: any) {
        // If we lost the refresh race (already rotated/revoked), do not allow the access token to stand.
        if (rotateError?.status === 401 && rotateError?.code === "invalid_grant") {
          if (accessToken?.access_token_hash) {
            await deleteOauthAccessTokenByHash(accessToken.access_token_hash);
          }
          return invalidGrant();
        }

        // Otherwise fail open: return the access token and keep the existing refresh token valid.
        console.warn("[oauth] refresh-token rotation failed; returning access token with existing refresh token", {
          code: rotateError?.code,
          status: rotateError?.status
        });
      }

      const effectiveScopes = rotated?.scopes ?? (Array.isArray(existing.scopes) ? existing.scopes : []);

      if (ctx) {
        ctx.auditEntityType = "oauth_refresh_token";
        ctx.auditEntityId = rotated?.new_token_id || existing?.token_id || null;
        ctx.security = {
          ...(ctx.security || {}),
          old_refresh_token_id: rotated?.old_token_id || null,
          refresh_token_id: rotated?.new_token_id || existing?.token_id || null,
          refresh_token_hash: rotated?.new_token_hash || existingTokenHash || null,
          installation_id: rotated?.installation_id || existing?.installation_id || null,
          access_token_hash: accessToken.access_token_hash || null
        };
      }

      return jsonResponse(200, {
        access_token: accessToken.access_token,
        token_type: "Bearer",
        expires_in: accessToken.expires_in,
        refresh_token: rotated?.new_refresh_token || refreshToken,
        scope: normalizeScope(effectiveScopes.join(" ")).join(" ")
      });
    } catch (error: any) {
      if (accessToken?.access_token_hash) {
        await deleteOauthAccessTokenByHash(accessToken.access_token_hash);
      }
      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }
      return invalidGrant();
    }
  }

  return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported grant_type"));
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.token",
  enableRateLimit: false
});
