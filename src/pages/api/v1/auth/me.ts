import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getOwner } from "../../../../server/services/owners";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId || ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "auth.me_viewed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ctx.ownerId;
  }

  try {
    const owner = await getOwner(ctx.ownerId);
    if (!owner) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Owner not found"));
    }

    return jsonResponse(
      200,
      {
        data: {
          owner_id: owner.owner_id,
          email: owner.email ?? null,
          email_verified_at: owner.email_verified_at ?? null
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "auth.me.read",
  enableIdempotency: false
});
