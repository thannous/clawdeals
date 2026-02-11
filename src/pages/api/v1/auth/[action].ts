import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import crypto from "node:crypto";

import { buildOwnerSessionClearCookie, isSecureRequest, readOwnerSessionCookie } from "../../../../server/auth/session-cookie";
import { confirmOwnerLogin, startOwnerLogin } from "../../../../server/services/owner-login";
import { getOwnerSessionByTokenHash, markOwnerSessionRevoked } from "../../../../server/services/owner-sessions";
import { hashOwnerSessionToken, isOwnerSessionToken } from "../../../../server/utils/session-tokens";
import { isUuid } from "../../../../server/utils/validators";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const LOGIN_START_ACTIONS = new Set(["login:start", "session:start", "session:login"]);
const LOGIN_CONFIRM_ACTIONS = new Set(["login:confirm", "session:confirm", "session:verify"]);
const LOGOUT_ACTIONS = new Set(["logout", "session:clear", "session:logout", "session:end"]);

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function shouldEchoToken() {
  if (process.env.OWNER_LOGIN_ECHO_TOKEN === "true") return true;
  if (process.env.OWNER_VERIFICATION_ECHO_TOKEN === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function hashUserAgent(ua: any) {
  const value = normalizeNonEmptyString(ua);
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
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

  if (value.includes(".")) {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    const bytes = parts.map((part) => Number.parseInt(part, 10));
    if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return null;
    return `${bytes[0]}.${bytes[1]}.${bytes[2]}.0`;
  }

  if (value.includes(":")) {
    const expanded = expandIpv6(value);
    if (!expanded) return null;
    const truncated = expanded.slice(0, 4).concat(["0000", "0000", "0000", "0000"]);
    return truncated.join(":");
  }

  return null;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const rawAction = resolveParam(req.query?.action);
  const action = rawAction ? String(rawAction) : "";

  if (LOGIN_START_ACTIONS.has(action)) {
    const body = req.body || {};
    const email = body.email;
    if (!email || typeof email !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is required"));
    }

    try {
      const result = await startOwnerLogin({
        email,
        ipTruncated: truncateIp(ctx?.ip),
        uaHash: hashUserAgent(ctx?.userAgent),
        now: new Date()
      });

      if (ctx) {
        ctx.auditEvent = "owner.login_magic_link_sent";
        ctx.auditEntityType = "owner";
        ctx.auditEntityId = result.owner?.owner_id || null;
      }

      const data: any = {
        owner_id: result.owner?.owner_id || null,
        session_id: result.session?.session_id || null,
        expires_at: result.session?.expires_at || null
      };

      if (shouldEchoToken()) {
        data.session_token = result.session_token;
      }

      return jsonResponse(201, { data }, { "Cache-Control": "no-store" });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (LOGIN_CONFIRM_ACTIONS.has(action)) {
    const body = req.body || {};
    const sessionId = body.session_id ?? body.sessionId;
    const token = body.token;

    if (!sessionId || typeof sessionId !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id is required"));
    }
    if (!isUuid(sessionId)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id must be a UUID"));
    }
    if (!token || typeof token !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "token is required"));
    }

    try {
      const cookieSecure = isSecureRequest(req);
      const result = await confirmOwnerLogin({ sessionId, token, cookieSecure, now: new Date() });

      if (ctx) {
        ctx.auditEvent = "owner.login_completed";
        ctx.auditEntityType = "owner";
        ctx.auditEntityId = result.owner?.owner_id || null;
      }

      return jsonResponse(
        200,
        {
          data: {
            owner_id: result.owner?.owner_id || null,
            session_id: result.session?.session_id || null,
            expires_at: result.session?.expires_at || null
          }
        },
        {
          "Set-Cookie": result.set_cookie,
          "Cache-Control": "no-store"
        }
      );
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (LOGOUT_ACTIONS.has(action)) {
    const cookieSecure = isSecureRequest(req);

    const sessionToken = readOwnerSessionCookie(req);
    if (sessionToken && isOwnerSessionToken(sessionToken)) {
      try {
        const tokenHash = hashOwnerSessionToken(sessionToken);
        const session = await getOwnerSessionByTokenHash(tokenHash);
        if (session?.session_id) {
          await markOwnerSessionRevoked(session.session_id, new Date());
        }
      } catch {
        // Best-effort only.
      }
    }

    if (ctx) {
      ctx.auditEvent = "owner.logout";
      ctx.auditEntityType = ctx.ownerId ? "owner" : null;
      ctx.auditEntityId = ctx.ownerId || null;
    }

    return jsonResponse(
      200,
      { data: { ok: true } },
      {
        "Set-Cookie": buildOwnerSessionClearCookie({ secure: cookieSecure }),
        "Cache-Control": "no-store"
      }
    );
  }

  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown auth action"));
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true
});
