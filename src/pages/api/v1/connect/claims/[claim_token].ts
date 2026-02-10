import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getConnectSessionByClaimToken } from "../../../../../server/services/connect-sessions";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const claimToken = resolveParam(req.query?.claim_token);
  if (!claimToken) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "claim_token is required"));
  }

  try {
    const session = await getConnectSessionByClaimToken({ claimToken: String(claimToken), now: new Date() });

    if (ctx) {
      ctx.auditEvent = "connect.claim_viewed";
      ctx.auditEntityType = "connect_session";
      ctx.auditEntityId = session?.session_id || null;
    }

    return jsonResponse(200, {
      data: {
        session_id: session.session_id,
        status: session.status,
        requested_agent_name: session.requested_agent_name,
        requested_scopes: session.requested_scopes || [],
        client_type: session.client_type || null,
        client_version: session.client_version || null,
        expires_at: session.expires_at,
        claimed_at: session.claimed_at ?? null
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "connect.claims.read",
  enableIdempotency: false
});

