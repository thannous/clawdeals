import { z } from "zod";

import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getNotificationPreferences, getOrCreateNotificationPreferences, updateNotificationPreferences } from "../../../../server/services/notification-preferences";
import { defaultNotificationSettings, publicNotificationSettings, NOTIFICATION_EVENT_TYPES, NOTIFICATION_MODES } from "../../../../shared/notification-settings";

const patchSchema = z.object({
  mode: z.enum(NOTIFICATION_MODES).optional(),
  timezone: z.string().trim().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone").optional(),
  quiet_enabled: z.boolean().optional(),
  quiet_start_min: z.number().int().min(0).max(1439).nullable().optional(),
  quiet_end_min: z.number().int().min(0).max(1439).nullable().optional(),
  daily_digest_hour: z.number().int().min(0).max(23).optional(),
  event_types: z.array(z.enum(NOTIFICATION_EVENT_TYPES)).max(4).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET" && req.method !== "PATCH") return methodNotAllowed(["GET", "PATCH"]);
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner" || !isUuid(ctx?.ownerId)) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const parsed = req.method === "PATCH" ? patchSchema.safeParse(req.body) : null;
  if (parsed && !parsed.success) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid notification preferences", parsed.error.issues));
  }

  try {
    const existing = await getNotificationPreferences(ctx.ownerId);
    let preferences = existing || defaultNotificationSettings();
    if (parsed?.success) {
      const next = { ...preferences, ...parsed.data };
      if (next.quiet_enabled && (
        next.quiet_start_min === null || next.quiet_end_min === null ||
        next.quiet_start_min === next.quiet_end_min
      )) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Quiet hours need distinct start and end times"));
      }
      if (!existing) await getOrCreateNotificationPreferences({ ownerId: ctx.ownerId });
      preferences = await updateNotificationPreferences({ ownerId: ctx.ownerId, patch: parsed.data });
      ctx.auditEvent = "owner.notification_preferences_updated";
      ctx.auditEntityType = "owner";
      ctx.auditEntityId = ctx.ownerId;
    }
    return jsonResponse(200, { data: { preferences: publicNotificationSettings(preferences) } }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

// Settings assignments are idempotent; use owner authentication, rate limits
// and audit without allocating a replay record for every form save.
export default withApiMiddlewares(handler, { enableIdempotency: false });
