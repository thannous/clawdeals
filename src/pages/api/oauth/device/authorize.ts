import crypto from "node:crypto";
import net from "node:net";

import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getPublicAppUrl, joinUrl } from "../../../../shared/urls";
import { createOauthDeviceAuthorization } from "../../../../server/services/oauth-device-authorizations";

const OAUTH_DEVICE_EXPIRES_IN_SECONDS = 10 * 60;
const OAUTH_DEVICE_POLL_INTERVAL_SECONDS = 2;

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

function normalizeScope(scope: any): string[] {
  const raw = normalizeNonEmptyString(scope);
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function expandIpv6(ip: string) {
  const strippedZone = ip.split("%")[0];
  if (!strippedZone) return null;

  const lastColon = strippedZone.lastIndexOf(":");
  if (strippedZone.includes(".") && lastColon !== -1) {
    const prefix = strippedZone.slice(0, lastColon);
    const v4 = strippedZone.slice(lastColon + 1);
    const parts = v4.split(".");
    if (parts.length !== 4) return null;
    const bytes = parts.map((part) => Number.parseInt(part, 10));
    if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return null;
    const a = ((bytes[0] << 8) | bytes[1]).toString(16);
    const b = ((bytes[2] << 8) | bytes[3]).toString(16);
    return expandIpv6(`${prefix}:${a}:${b}`);
  }

  const parts = strippedZone.split("::");
  if (parts.length > 2) return null;

  const left = parts[0] ? parts[0].split(":").filter((p) => p.length > 0) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter((p) => p.length > 0) : [];
  if (parts.length === 1 && left.length !== 8) return null;

  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  const normalized = groups.map((group) => {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    return group.toLowerCase().padStart(4, "0");
  });
  if (normalized.some((g) => g === null)) return null;

  return normalized as string[];
}

function truncateIp(ip: any) {
  const value = normalizeNonEmptyString(ip);
  if (!value) return null;

  const kind = net.isIP(value);
  if (kind === 4) {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    const bytes = parts.map((part) => Number.parseInt(part, 10));
    if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return null;
    return `${bytes[0]}.${bytes[1]}.${bytes[2]}.0`;
  }

  if (kind === 6) {
    const expanded = expandIpv6(value);
    if (!expanded) return null;
    const truncated = expanded.slice(0, 4).concat(["0000", "0000", "0000", "0000"]);
    return truncated.join(":");
  }

  return null;
}

function hashUserAgent(ua: any) {
  const value = normalizeNonEmptyString(ua);
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseAuthorizeBody(req: any) {
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

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const body = parseAuthorizeBody(req);

  const clientIdRaw = body.client_id ?? body.clientId ?? null;
  const clientId = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
  if (!clientId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id is required"));
  }
  if (clientId !== "openclaw") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id must be 'openclaw'"));
  }

  const scope = body.scope ?? null;
  const requestedAgentNameRaw = body.requested_agent_name ?? body.requestedAgentName ?? null;
  const requestedAgentName =
    typeof requestedAgentNameRaw === "string" ? requestedAgentNameRaw.trim() : "";
  if (requestedAgentName && requestedAgentName.length > 80) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_agent_name must be at most 80 characters"));
  }

  try {
    if (ctx) {
      ctx.auditEvent = "oauth.device_authorize";
    }

    const created = await createOauthDeviceAuthorization({
      clientId,
      requestedScopes: normalizeScope(scope),
      requestedAgentName: requestedAgentName || null,
      ipTruncated: truncateIp(ctx?.ip),
      uaHash: hashUserAgent(ctx?.userAgent),
      now: new Date()
    });

    const verificationUri = joinUrl(getPublicAppUrl(), "/device");
    const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(created.user_code)}`;

    if (ctx) {
      ctx.auditEntityType = "oauth_device_authorization";
      ctx.auditEntityId = created.authorization?.authorization_id || null;
      ctx.security = {
        ...(ctx.security || {}),
        authorization_id: created.authorization?.authorization_id || null,
        client_id: created.authorization?.client_id || null,
        device_code_hash: created.authorization?.device_code_hash || null,
        user_code_hash: created.authorization?.user_code_hash || null
      };
    }

    return jsonResponse(200, {
      device_code: created.device_code,
      user_code: created.user_code,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: OAUTH_DEVICE_EXPIRES_IN_SECONDS,
      interval: OAUTH_DEVICE_POLL_INTERVAL_SECONDS
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.device.authorize_ip",
  enableIdempotency: true,
  idempotencyUseIpFallback: true
});
