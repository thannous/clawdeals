import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { denyOauthDeviceAuthorization } from "../../../../server/services/oauth-device-authorizations";
import { getOwner } from "../../../../server/services/owners";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveUserCode(body: any) {
  const raw = body?.user_code ?? body?.userCode ?? null;
  return typeof raw === "string" ? raw.trim() : "";
}

function sanitizeCtxBody(ctx: any, body: any) {
  if (!ctx) return;
  if (!body || typeof body !== "object") {
    ctx.body = {};
    return;
  }
  const copy: any = { ...body };
  delete copy.user_code;
  delete copy.userCode;
  ctx.body = copy;
}

function jsonNoStore(status: number, body: any, headers: Record<string, string> = {}) {
  return jsonResponse(status, body, {
    ...NO_STORE_HEADERS,
    ...headers
  });
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonNoStore(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonNoStore(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  if (!ctx?.ownerId || ctx?.actor?.type !== "owner") {
    return jsonNoStore(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonNoStore(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }
  const owner = await getOwner(ctx.ownerId);
  if (!owner) {
    return jsonNoStore(404, errorPayload("NOT_FOUND", "Owner not found"));
  }
  if (!owner.email_verified_at) {
    return jsonNoStore(
      403,
      errorPayload("OWNER_EMAIL_NOT_VERIFIED", "Owner email must be verified to deny device authorization")
    );
  }

  const body = req.body || {};
  const userCode = resolveUserCode(body);
  sanitizeCtxBody(ctx, body);

  if (!userCode) {
    return jsonNoStore(400, errorPayload("VALIDATION_ERROR", "user_code is required"));
  }

  if (ctx) {
    ctx.auditEvent = "oauth.device_denied";
    ctx.auditEntityType = "oauth_device_authorization";
  }

  try {
    const denied = await denyOauthDeviceAuthorization({ userCode, now: new Date() });

    if (ctx) {
      ctx.auditEntityId = denied.authorization_id || null;
      ctx.security = {
        ...(ctx.security || {}),
        authorization_id: denied.authorization_id || null,
        client_id: denied.client_id || null,
        device_code_hash: denied.device_code_hash || null,
        user_code_hash: denied.user_code_hash || null
      };
    }

    return jsonNoStore(200, {
      data: {
        authorization_id: denied.authorization_id,
        status: denied.status,
        denied_at: denied.denied_at || null
      }
    });
  } catch (error: any) {
    return jsonNoStore(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.device.deny_ip",
  enableIdempotency: true,
  idempotencyUseIpFallback: true
});
