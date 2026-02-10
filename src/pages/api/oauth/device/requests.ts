import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getOauthDeviceAuthorizationByUserCode } from "../../../../server/services/oauth-device-authorizations";

function resolveQueryParam(value: any) {
  if (Array.isArray(value)) return value[0] || "";
  if (value === null || value === undefined) return "";
  return String(value);
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const userCode = resolveQueryParam(req.query?.user_code ?? req.query?.userCode).trim();
  if (!userCode) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "user_code is required"));
  }

  try {
    const row = await getOauthDeviceAuthorizationByUserCode({ userCode, now: new Date() });

    return jsonResponse(200, {
      data: {
        authorization_id: row.authorization_id,
        status: row.status,
        client_id: row.client_id,
        requested_scopes: row.requested_scopes || [],
        requested_agent_name: row.requested_agent_name || null,
        expires_at: row.expires_at || null,
        owner_id: row.owner_id || null,
        agent_id: row.agent_id || null,
        authorized_at: row.authorized_at || null,
        denied_at: row.denied_at || null
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.device.requests.read_ip",
  enableAudit: false,
  enableIdempotency: false
});
