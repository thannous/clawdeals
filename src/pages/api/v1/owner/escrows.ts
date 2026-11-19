import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { listProtectedCheckoutsForOwner } from "../../../../server/services/protected-checkout";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const ownerId = ctx?.actor?.type === "owner" ? ctx?.ownerId || null : null;
  if (!ownerId || !isUuid(ownerId)) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "owner.escrows_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const escrows = await listProtectedCheckoutsForOwner({ ownerId });
    return jsonResponse(200, { data: { escrows } }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "owner.escrows.read", enableIdempotency: false });
