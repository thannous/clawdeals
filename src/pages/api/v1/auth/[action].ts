import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import crypto from "node:crypto";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";

import { buildOwnerSessionClearCookies, isSecureRequest, readOwnerSessionCookie } from "../../../../server/auth/session-cookie";
import { confirmOwnerLogin, startOwnerLogin } from "../../../../server/services/owner-login";
import { sendOwnerLoginMagicLinkEmail } from "../../../../server/services/owner-login-email";
import { issueTrustedOwnerSession } from "../../../../server/services/owner-session-issue";
import { getOwnerSessionByTokenHash, markOwnerSessionRevoked } from "../../../../server/services/owner-sessions";
import {
  createOwnerLink,
  getOwnerLinkBySupabaseUserId,
  touchOwnerLinkLogin
} from "../../../../server/services/owner-auth-links";
import { getOwner, getOwnerByEmail, upsertOwner } from "../../../../server/services/owners";
import { normalizeEmail } from "../../../../server/utils/owner-verification";
import { hashOwnerSessionToken, isOwnerSessionToken } from "../../../../server/utils/session-tokens";
import { isUuid } from "../../../../server/utils/validators";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const LOGIN_START_ACTIONS = new Set(["login:start", "session:start", "session:login"]);
const LOGIN_CONFIRM_ACTIONS = new Set(["login:confirm", "session:confirm", "session:verify"]);
const SESSION_BRIDGE_ACTIONS = new Set(["session:bridge", "bridge", "login:bridge"]);
const LOGOUT_ACTIONS = new Set(["logout", "session:clear", "session:logout", "session:end"]);

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBearerToken(value: any) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

function parseIsoDate(value: any) {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return null;
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

function resolveRequestOrigin(req: any) {
  const forwardedProto = normalizeNonEmptyString(getHeaderValue(req, "x-forwarded-proto"));
  const forwardedHost = normalizeNonEmptyString(getHeaderValue(req, "x-forwarded-host"));
  const hostHeader = normalizeNonEmptyString(getHeaderValue(req, "host"));

  const proto = (forwardedProto ? forwardedProto.split(",")[0] : isSecureRequest(req) ? "https" : "http").trim().toLowerCase();
  const host = (forwardedHost ? forwardedHost.split(",")[0] : hostHeader || "").trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

function resolveSupabaseEmailVerifiedAt(user: any): string | null {
  const direct = parseIsoDate(user?.email_confirmed_at) || parseIsoDate(user?.confirmed_at);
  if (direct) return direct;

  if (user?.user_metadata?.email_verified === true) {
    return new Date().toISOString();
  }

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const identityVerified = identities.some((identity: any) => identity?.identity_data?.email_verified === true);
  if (identityVerified) {
    return new Date().toISOString();
  }

  return null;
}

function resolveSupabaseProvider(user: any): string | null {
  const fromAppMetadata = normalizeNonEmptyString(user?.app_metadata?.provider);
  if (fromAppMetadata) return fromAppMetadata;
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  for (const identity of identities) {
    const provider = normalizeNonEmptyString(identity?.provider);
    if (provider) return provider;
  }
  return null;
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

      const delivery = await sendOwnerLoginMagicLinkEmail({
        email: result.owner?.email || email,
        sessionId: result.session?.session_id,
        token: result.session_token,
        expiresAt: result.session?.expires_at || null,
        appUrl: resolveRequestOrigin(req)
      });

      if (ctx) {
        ctx.auditEvent = "owner.login_magic_link_sent";
        ctx.auditEntityType = "owner";
        ctx.auditEntityId = result.owner?.owner_id || null;
        ctx.security = {
          ...(ctx.security || {}),
          owner_login_email_provider: delivery.provider,
          owner_login_email_skipped: delivery.skipped,
          owner_login_email_message_id: delivery.message_id || null
        };
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

  if (SESSION_BRIDGE_ACTIONS.has(action)) {
    const authHeader = getHeaderValue(req, "authorization");
    const bearerToken = parseBearerToken(authHeader);
    const accessToken = normalizeNonEmptyString(bearerToken);
    if (!accessToken) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Bearer authorization is required"));
    }

    try {
      const now = new Date();
      const supabase = getSupabaseServiceClient();
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data?.user) {
        return jsonResponse(401, errorPayload("UNAUTHORIZED", "Invalid Supabase access token"));
      }

      const supabaseUserId = normalizeNonEmptyString(data.user.id);
      if (!supabaseUserId || !isUuid(supabaseUserId)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "supabase user id must be a UUID"));
      }

      const email = normalizeEmail(data.user.email);
      const emailVerifiedAt = resolveSupabaseEmailVerifiedAt(data.user);
      const provider = resolveSupabaseProvider(data.user);

      let linkCreated = false;
      let linkedByVerifiedEmail = false;

      let ownerLink = await getOwnerLinkBySupabaseUserId(supabaseUserId);
      let owner: any = null;

      if (ownerLink) {
        const existingOwner = await getOwner(ownerLink.owner_id);
        const nextEmail = email ?? existingOwner?.email ?? null;
        const existingEmail = normalizeEmail(existingOwner?.email);
        const nextEmailNormalized = normalizeEmail(nextEmail);
        const emailChanged = existingEmail !== nextEmailNormalized;
        const resolvedOwnerEmailVerifiedAt = emailVerifiedAt ?? (emailChanged ? null : existingOwner?.email_verified_at ?? null);
        const existingPhone = existingOwner?.phone_e164 ?? null;
        const existingPhoneVerifiedAt = existingOwner?.phone_verified_at ?? null;

        owner = await upsertOwner({
          ownerId: ownerLink.owner_id,
          email: nextEmail,
          phoneE164: existingPhone,
          emailVerifiedAt: resolvedOwnerEmailVerifiedAt,
          phoneVerifiedAt: existingPhoneVerifiedAt,
          updatedAt: now
        });

        await touchOwnerLinkLogin({
          supabaseUserId,
          email: email ?? null,
          emailVerifiedAt: resolvedOwnerEmailVerifiedAt,
          now
        });
      } else {
        const ownerByEmail = email ? await getOwnerByEmail(email) : null;
        if (ownerByEmail && !emailVerifiedAt) {
          return jsonResponse(
            409,
            errorPayload(
              "OWNER_EMAIL_LINK_CONFLICT",
              "Existing owner found for email; verification required before linking"
            )
          );
        }

        if (ownerByEmail) {
          linkedByVerifiedEmail = true;
          owner = await upsertOwner({
            ownerId: ownerByEmail.owner_id,
            email: email ?? ownerByEmail.email ?? null,
            phoneE164: ownerByEmail.phone_e164 ?? null,
            emailVerifiedAt: emailVerifiedAt ?? null,
            phoneVerifiedAt: ownerByEmail.phone_verified_at ?? null,
            updatedAt: now
          });
        } else {
          owner = await upsertOwner({
            ownerId: crypto.randomUUID(),
            email: email ?? null,
            phoneE164: null,
            emailVerifiedAt: emailVerifiedAt ?? null,
            phoneVerifiedAt: null,
            updatedAt: now
          });
        }

        ownerLink = await createOwnerLink({
          ownerId: owner.owner_id,
          supabaseUserId,
          email: email ?? null,
          emailVerifiedAt: emailVerifiedAt ?? null,
          now
        });
        linkCreated = true;
      }

      if (!owner?.owner_id || !isUuid(owner.owner_id)) {
        return jsonResponse(500, errorPayload("ERROR", "Failed to resolve owner account"));
      }
      if (owner.suspended_at) {
        return jsonResponse(403, errorPayload("OWNER_SUSPENDED", "Owner account is suspended"));
      }

      const cookieSecure = isSecureRequest(req);
      const issued = await issueTrustedOwnerSession({
        ownerId: owner.owner_id,
        cookieSecure,
        ipTruncated: truncateIp(ctx?.ip),
        uaHash: hashUserAgent(ctx?.userAgent),
        now
      });

      if (ctx) {
        ctx.auditEvent = linkedByVerifiedEmail
          ? "owner.linked_by_verified_email"
          : linkCreated
            ? "owner.link_created"
            : "owner.login_bridged";
        ctx.auditEntityType = "owner";
        ctx.auditEntityId = owner.owner_id;
        ctx.security = {
          ...(ctx.security || {}),
          owner_auth_link_id: ownerLink?.link_id || null,
          supabase_user_id: supabaseUserId,
          auth_provider: provider || null
        };
      }

      return jsonResponse(
        200,
        {
          data: {
            owner_id: owner.owner_id,
            email: owner.email ?? null,
            email_verified_at: owner.email_verified_at ?? null,
            auth_provider: provider || null,
            session_expires_at: issued.session?.expires_at || null
          }
        },
        {
          "Set-Cookie": issued.set_cookie,
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
        "Set-Cookie": buildOwnerSessionClearCookies({ secure: cookieSecure }),
        "Cache-Control": "no-store"
      }
    );
  }

  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown auth action"));
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true
});
