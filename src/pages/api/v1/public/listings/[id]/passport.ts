import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { passportError, passportParam } from "../../../../../../server/http/smartphone-passport";
import { getSmartphonePassport } from "../../../../../../server/services/smartphone-passports";

export async function handler(req: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  try {
    const passport = await getSmartphonePassport(passportParam(req), { kind: "public" });
    return jsonResponse(200, { data: { passport } }, { "Cache-Control": "private, no-store" });
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { routeGroup: "passport.public.read", enableIdempotency: false });
