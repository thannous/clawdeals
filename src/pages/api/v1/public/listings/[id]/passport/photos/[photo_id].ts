import { withApiMiddlewares } from "../../../../../../../../server/middleware/with-api-middlewares";
import { methodNotAllowed } from "../../../../../../../../server/http/methods";
import { passportError, passportParam, sendPassportPhoto } from "../../../../../../../../server/http/smartphone-passport";
import { getSmartphonePassportPhoto } from "../../../../../../../../server/services/smartphone-passports";

export async function handler(req: any, res: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  try {
    const bytes = await getSmartphonePassportPhoto(passportParam(req), passportParam(req, "photo_id"), { kind: "public" });
    sendPassportPhoto(res, bytes);
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { routeGroup: "passport.public.read", enableIdempotency: false });
