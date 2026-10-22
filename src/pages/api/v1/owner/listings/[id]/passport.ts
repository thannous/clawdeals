import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { passportError, passportParam, requirePassportOwner } from "../../../../../../server/http/smartphone-passport";
import { getSmartphonePassport, saveSmartphonePassport } from "../../../../../../server/services/smartphone-passports";

export async function handler(req: any, _res: any, ctx: any) {
  if (!["GET", "PUT"].includes(req.method)) return methodNotAllowed(["GET", "PUT"]);
  const blocked = requirePassportOwner(req, ctx, req.method === "PUT");
  if (blocked) return blocked;
  try {
    const id = passportParam(req);
    const passport = req.method === "GET"
      ? await getSmartphonePassport(id, { kind: "owner", ownerId: ctx.ownerId })
      : await saveSmartphonePassport(id, ctx.ownerId, req.body);
    ctx.auditEvent = req.method === "GET" ? "passport.read" : "passport.saved";
    ctx.auditEntityType = "listing";
    ctx.auditEntityId = id;
    return jsonResponse(200, { data: { passport } }, { "Cache-Control": "private, no-store" });
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false });
