import { withApiMiddlewares } from "../../../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../../../server/http/methods";
import { passportError, passportParam, requirePassportOwner } from "../../../../../../../../server/http/smartphone-passport";
import { uploadSmartphonePassportPhoto } from "../../../../../../../../server/services/smartphone-passports";

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  const blocked = requirePassportOwner(req, ctx, true);
  if (blocked) return blocked;
  try {
    const id = passportParam(req);
    const photo = await uploadSmartphonePassportPhoto(id, ctx.ownerId, req.body);
    ctx.auditEvent = "passport.photo_uploaded";
    ctx.auditEntityType = "listing";
    ctx.auditEntityId = id;
    return jsonResponse(201, { data: photo }, { "Cache-Control": "private, no-store" });
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false });
