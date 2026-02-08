import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getPspConfig } from "../../../../../server/services/psp-config";
import { isUuid } from "../../../../../server/utils/validators";

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId || !isUuid(ownerId)) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "psp.status_read";
  }

  try {
    const config = await getPspConfig();
    if (!config) {
      return jsonResponse(200, { configured: false });
    }
    return jsonResponse(200, {
      configured: true,
      provider: config.provider,
      mode: config.mode,
      webhook_secret_ref: config.webhook_secret_ref,
      platform_fee_bps_default: config.platform_fee_bps_default,
      updated_at: config.updated_at
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "ops.psp.read" });

