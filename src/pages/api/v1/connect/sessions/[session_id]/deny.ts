import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { isUuid } from "../../../../../../server/utils/validators";
import { denyConnectSession, getConnectSessionByClaimToken } from "../../../../../../server/services/connect-sessions";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function resolveClaimToken(body: any) {
  const claimToken = body?.claim_token ?? body?.claimToken ?? null;
  return typeof claimToken === "string" ? claimToken.trim() : "";
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

  const sessionId = resolveParam(req.query?.session_id);
  if (!isUuid(sessionId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id must be a UUID"));
  }

  if (!ctx?.ownerId || ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }

  const body = req.body || {};
  const claimToken = resolveClaimToken(body);
  if (!claimToken) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "claim_token is required"));
  }

  try {
    const session = await getConnectSessionByClaimToken({ claimToken, now: new Date() });
    if (!session || session.session_id !== String(sessionId)) {
      return jsonResponse(404, errorPayload("CONNECT_SESSION_NOT_FOUND", "Connect session not found"));
    }

    if (ctx) {
      ctx.auditEvent = "connect.session_denied";
      ctx.auditEntityType = "connect_session";
      ctx.auditEntityId = String(sessionId);
    }

    const denied = await denyConnectSession({ sessionId: String(sessionId), claimToken, now: new Date() });
    return jsonResponse(200, {
      data: {
        session_id: denied.session_id,
        status: denied.status,
        cancelled_at: denied.cancelled_at || null
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "connect.sessions.deny_owner",
  enableIdempotency: true
});

