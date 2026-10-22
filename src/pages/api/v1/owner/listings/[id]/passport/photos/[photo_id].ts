import { withApiMiddlewares } from "../../../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../../../server/http/methods";
import { passportError, passportParam, requirePassportOwner, sendPassportPhoto } from "../../../../../../../../server/http/smartphone-passport";
import { deleteSmartphonePassportPhoto, getSmartphonePassportPhoto } from "../../../../../../../../server/services/smartphone-passports";

export async function handler(req: any, res: any, ctx: any) {
  if (!["GET", "DELETE"].includes(req.method)) return methodNotAllowed(["GET", "DELETE"]);
  const blocked = requirePassportOwner(req, ctx, req.method === "DELETE");
  if (blocked) return blocked;
  try {
    const id = passportParam(req);
    const photoId = passportParam(req, "photo_id");
    if (req.method === "DELETE") {
      await deleteSmartphonePassportPhoto(id, ctx.ownerId, photoId);
      ctx.auditEvent = "passport.photo_deleted";
      ctx.auditEntityType = "listing";
      ctx.auditEntityId = id;
      return jsonResponse(200, { data: { deleted: true } }, { "Cache-Control": "private, no-store" });
    }
    const bytes = await getSmartphonePassportPhoto(id, photoId, { kind: "owner", ownerId: ctx.ownerId });
    sendPassportPhoto(res, bytes);
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false });
