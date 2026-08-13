import crypto from "node:crypto";
import net from "node:net";

import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getPublicAppUrl, joinUrl } from "../../../../../shared/urls";
import { normalizeAcquisitionId } from "../../../../../shared/acquisition";
import { createConnectSession } from "../../../../../server/services/connect-sessions";
import { safeRecordActivationStarted } from "../../../../../server/services/acquisition";

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function resolveRequestOrigin(req: any) {
  const forwardedProto = normalizeNonEmptyString(getHeaderValue(req, "x-forwarded-proto"));
  const forwardedHost = normalizeNonEmptyString(getHeaderValue(req, "x-forwarded-host"));
  const hostHeader = normalizeNonEmptyString(getHeaderValue(req, "host"));
  const host = (forwardedHost ? forwardedHost.split(",")[0] : hostHeader || "").trim();
  if (!host) return null;

  const fromHeader = (forwardedProto ? forwardedProto.split(",")[0] : "").trim().toLowerCase();
  if (fromHeader === "http" || fromHeader === "https") {
    return `${fromHeader}://${host}`;
  }

  const hostLower = host.toLowerCase();
  const isLocalHost =
    hostLower === "localhost" ||
    hostLower.startsWith("localhost:") ||
    hostLower.startsWith("127.0.0.1") ||
    hostLower.startsWith("[::1]") ||
    hostLower.endsWith(".local");

  return `${isLocalHost ? "http" : "https"}://${host}`;
}

function expandIpv6(ip: string) {
  const strippedZone = ip.split("%")[0];
  if (!strippedZone) return null;

  // Convert IPv4 tail (::ffff:192.0.2.1) into hextets first.
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
    // /64: keep the first 4 hextets.
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

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const body = req.body || {};
  const requestedAgentName = body.requested_agent_name ?? body.requestedAgentName;
  const requestedScopes = body.requested_scopes ?? body.requestedScopes;
  const rawAcquisitionId = body.acquisition_id ?? body.acquisitionId;
  const acquisitionId = normalizeAcquisitionId(rawAcquisitionId);

  if (!requestedAgentName || typeof requestedAgentName !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_agent_name is required"));
  }
  if (requestedAgentName.length > 80) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_agent_name must be at most 80 characters"));
  }
  if (requestedScopes !== undefined && !Array.isArray(requestedScopes)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_scopes must be an array"));
  }
  if (rawAcquisitionId !== undefined && rawAcquisitionId !== null && !acquisitionId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "acquisition_id must be a UUID"));
  }

  const clientType = getHeaderValue(req, "x-client-type");
  const clientVersion = getHeaderValue(req, "x-client-version");

  try {
    if (ctx) {
      ctx.auditEvent = "connect.session_created";
    }

    const created = await createConnectSession({
      requestedAgentName,
      requestedScopes,
      clientType,
      clientVersion,
      acquisitionId,
      ipTruncated: truncateIp(ctx?.ip),
      uaHash: hashUserAgent(ctx?.userAgent),
      now: new Date()
    });
    if (acquisitionId) {
      await safeRecordActivationStarted({
        acquisitionId,
        sessionId: created.session.session_id,
        occurredAt: new Date(created.session.created_at)
      });
    }

    const appBaseUrl = resolveRequestOrigin(req) || getPublicAppUrl();
    const claimUrl = joinUrl(appBaseUrl, `/claim/${encodeURIComponent(created.claim_token)}`);

    if (ctx) {
      ctx.auditEntityType = "connect_session";
      ctx.auditEntityId = created.session?.session_id || null;
      ctx.security = {
        ...(ctx.security || {}),
        session_id: created.session?.session_id || null,
        poll_token_hash: created.session?.poll_token_hash || null,
        claim_token_hash: created.session?.claim_token_hash || null
      };
    }

    return jsonResponse(
      201,
      {
        data: {
          session_id: created.session.session_id,
          status: created.session.status,
          claim_url: claimUrl,
          verification_code: created.verification_code,
          poll_token: created.poll_token,
          expires_at: created.session.expires_at,
          interval_seconds: 2
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "connect.sessions.create_ip",
  enableIdempotency: true,
  idempotencyUseIpFallback: true
});
