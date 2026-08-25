import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import {
  consumeOauthDeviceTokenPollAttempt,
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
import { V1_SCOPES_DEFAULT, normalizeRequestedScopes, sortScopesStable } from "../../../shared/scopes/v1";

const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const OAUTH_TOKEN_NO_STORE_HEADERS = { "Cache-Control": "no-store" };

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

function normalizeGrantedScopes(value: any): string[] {
  const normalized = normalizeRequestedScopes(value);
  if (normalized.unknown.length > 0) {
    throw Object.assign(new Error("Unsupported OAuth scope"), {
      code: "invalid_scope",
      unknownScopes: normalized.unknown
    });
  }
  if (normalized.requested.length === 0) {
    return [...V1_SCOPES_DEFAULT];
  }
  return sortScopesStable(normalized.normalized);
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

function buildNoStoreHeaders(headers: Record<string, string> = {}) {
  return {
    ...OAUTH_TOKEN_NO_STORE_HEADERS,
    ...headers
  };
}

function oauthError(code: string, message: string, status: number, headers: Record<string, string> = {}) {
  return jsonResponse(status, {
    error: {
      code,
      message
    }
  }, buildNoStoreHeaders(headers));
}

function invalidGrant(message = "Invalid grant") {
  return oauthError("invalid_grant", message, 400);
}

function parsePositiveSeconds(value: any): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.ceil(parsed);
}

function resolveRetryAfterSeconds(value: any): number | null {
  const candidates = [
    value?.retry_after_seconds,
    value?.retryAfterSeconds,
    value?.details?.retry_after_seconds,
    value?.details?.retryAfterSeconds
  ];

  for (const candidate of candidates) {
    const parsed = parsePositiveSeconds(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function isSlowDownSignal(value: any) {
  if (!value) return false;

  const code = normalizeNonEmptyString(value.code ?? value.error ?? value.reason)?.toLowerCase();
  if (code === "slow_down" || code === "device_poll_too_fast" || code === "oauth_device_poll_too_fast") {
    return true;
  }

  return (
    value.status === 429 ||
    value.slowDown === true ||
    value.shouldSlowDown === true ||
    value.pollTooFast === true ||
    value.tooFast === true
  );
}

function slowDownError(retryAfterSeconds: number | null = null) {
  const headers = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
  return oauthError("slow_down", "Slow down", 400, headers);
}

async function enforceDevicePollInterval({
  authorization,
  deviceCode,
  now = new Date()
}: {
  authorization: any;
  deviceCode: string;
  now?: Date;
}) {
  if (authorization?.status !== "PENDING") return null;
  try {
    const result = await consumeOauthDeviceTokenPollAttempt({ authorization, deviceCode, now });
    if (isSlowDownSignal(result)) {
      return slowDownError(resolveRetryAfterSeconds(result));
    }
    return null;
  } catch (error: any) {
    if (isSlowDownSignal(error)) {
      return slowDownError(resolveRetryAfterSeconds(error));
    }
    throw error;
  }
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(
      ctx.authError.status || 401,
      errorPayload(ctx.authError.code, ctx.authError.message),
      buildNoStoreHeaders()
    );
  }

  const body = parseTokenBody(req);
  sanitizeCtxBody(ctx, body);

  const clientIdRaw = body.client_id ?? body.clientId ?? null;
  const clientId = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
  if (!clientId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id is required"), buildNoStoreHeaders());
  }
  if (clientId !== "openclaw") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id must be 'openclaw'"), buildNoStoreHeaders());
  }

  const grantTypeRaw = body.grant_type ?? body.grantType ?? null;
  const grantType = typeof grantTypeRaw === "string" ? grantTypeRaw.trim() : "";
  if (!grantType) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "grant_type is required"), buildNoStoreHeaders());
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
      return jsonResponse(
        rateLimitResult.status,
        rateLimitResult.body,
        buildNoStoreHeaders(rateLimitResult.headers || {})
      );
    }

    const deviceCode = normalizeNonEmptyString(body.device_code ?? body.deviceCode);
    if (!deviceCode) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "device_code is required"), buildNoStoreHeaders());
    }

    const now = new Date();
    let authorization: any;
    try {
      authorization = await getOauthDeviceAuthorizationByDeviceCode({ deviceCode, now });
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(
          error.status || 500,
          errorPayload(error.code || "ERROR", error.message, error.details),
          buildNoStoreHeaders()
        );
      }
      return invalidGrant();
    }

    const slowDownResponse = await enforceDevicePollInterval({ authorization, deviceCode, now });
    if (slowDownResponse) {
      return slowDownResponse;
    }

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

    const requestedScopes = authorization?.requested_scopes;
    let grantedScopes: string[];
    try {
      grantedScopes = normalizeGrantedScopes(requestedScopes);
    } catch (error: any) {
      return oauthError("invalid_scope", "Device authorization contains unsupported scopes", 400);
    }

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
        oauthScopes: grantedScopes,
        now
      });

      const refresh = await issueRefreshTokenRecord({
        ownerId,
        agentId,
        installationId: installation.installation_id,
        scopes: grantedScopes,
        now
      });

      accessToken = await issueOauthAccessToken({
        ownerId,
        agentId,
        installationId: installation.installation_id,
        scopes: grantedScopes,
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

      return jsonResponse(
        200,
        {
          access_token: accessToken.access_token,
          token_type: "Bearer",
          expires_in: accessToken.expires_in,
          refresh_token: refresh.refresh_token,
          scope: grantedScopes.join(" ")
        },
        { "Cache-Control": "no-store" }
      );
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
        return jsonResponse(
          error.status || 500,
          errorPayload(error.code || "ERROR", error.message, error.details),
          buildNoStoreHeaders()
        );
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
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "refresh_token is required"), buildNoStoreHeaders());
    }

    let existing: any;
    let existingTokenHash: string | null = null;
    try {
      const found = await getOauthRefreshTokenRecordByToken({ refreshToken });
      existing = found?.record || null;
      existingTokenHash = found?.tokenHash || null;
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(
          error.status || 500,
          errorPayload(error.code || "ERROR", error.message, error.details),
          buildNoStoreHeaders()
        );
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
      return jsonResponse(
        rateLimitResult.status,
        rateLimitResult.body,
        buildNoStoreHeaders(rateLimitResult.headers || {})
      );
    }

    let accessToken: any = null;
    try {
      accessToken = await issueOauthAccessToken({
        ownerId: existing.owner_id || null,
        agentId: existing.agent_id,
        installationId: existing.installation_id,
        scopes: normalizeGrantedScopes(Array.isArray(existing.scopes) ? existing.scopes : []),
        now
      });

      // Rotate after access-token issuance. If rotation fails, fail closed by revoking the
      // just-issued access token in the outer catch block.
      const rotated = await rotateRefreshToken({ refreshToken, now });

      const effectiveScopes = normalizeGrantedScopes(rotated?.scopes ?? (Array.isArray(existing.scopes) ? existing.scopes : []));

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

      return jsonResponse(
        200,
        {
          access_token: accessToken.access_token,
          token_type: "Bearer",
          expires_in: accessToken.expires_in,
          refresh_token: rotated?.new_refresh_token || refreshToken,
          scope: effectiveScopes.join(" ")
        },
        { "Cache-Control": "no-store" }
      );
    } catch (error: any) {
      if (accessToken?.access_token_hash) {
        await deleteOauthAccessTokenByHash(accessToken.access_token_hash);
      }
      if (error?.status && error.status >= 500) {
        return jsonResponse(
          error.status || 500,
          errorPayload(error.code || "ERROR", error.message, error.details),
          buildNoStoreHeaders()
        );
      }
      return invalidGrant();
    }
  }

  return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported grant_type"), buildNoStoreHeaders());
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.token",
  enableRateLimit: false
});
