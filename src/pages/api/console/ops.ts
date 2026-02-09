import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import {
  CONSOLE_OPS_DEFAULT_WINDOW_MINUTES,
  CONSOLE_OPS_WINDOW_MINUTES_RANGE,
  getConsoleOpsDashboard
} from "../../../server/services/console-ops-dashboard";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "console.ops_dashboard_viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const windowMinutesRaw = resolveParam(req.query?.window_minutes);
  let windowMinutes = CONSOLE_OPS_DEFAULT_WINDOW_MINUTES;
  if (windowMinutesRaw !== undefined && windowMinutesRaw !== null && windowMinutesRaw !== "") {
    const parsed = Number.parseInt(String(windowMinutesRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "window_minutes must be an integer"));
    }
    if (parsed < CONSOLE_OPS_WINDOW_MINUTES_RANGE.min || parsed > CONSOLE_OPS_WINDOW_MINUTES_RANGE.max) {
      return jsonResponse(
        400,
        errorPayload(
          "VALIDATION_ERROR",
          `window_minutes must be between ${CONSOLE_OPS_WINDOW_MINUTES_RANGE.min} and ${CONSOLE_OPS_WINDOW_MINUTES_RANGE.max}`
        )
      );
    }
    windowMinutes = parsed;
  }

  try {
    const data = await getConsoleOpsDashboard({ windowMinutes });
    return jsonResponse(200, data);
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.ops.read" }));

