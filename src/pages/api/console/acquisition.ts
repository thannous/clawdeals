import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import {
  CONSOLE_ACQUISITION_DEFAULT_WINDOW_DAYS,
  CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE,
  getConsoleAcquisitionDashboard
} from "../../../server/services/console-acquisition-dashboard";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseStrictIntParam(value: any): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "console.acquisition_dashboard_viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const daysRaw = resolveParam(req.query?.days);
  let windowDays = CONSOLE_ACQUISITION_DEFAULT_WINDOW_DAYS;
  if (daysRaw !== undefined && daysRaw !== null && daysRaw !== "") {
    const parsed = parseStrictIntParam(daysRaw);
    if (parsed === null) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "days must be an integer"));
    }
    if (parsed < CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE.min || parsed > CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE.max) {
      return jsonResponse(
        400,
        errorPayload(
          "VALIDATION_ERROR",
          `days must be between ${CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE.min} and ${CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE.max}`
        )
      );
    }
    windowDays = parsed;
  }

  try {
    const data = await getConsoleAcquisitionDashboard({ windowDays });
    return jsonResponse(200, data);
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.ops.read" }));
