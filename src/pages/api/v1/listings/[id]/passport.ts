import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { errorPayload } from "../../../../../server/http/errors";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { passportError, passportParam } from "../../../../../server/http/smartphone-passport";
import { getSmartphonePassport } from "../../../../../server/services/smartphone-passports";

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  if (ctx?.authError) return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  if (ctx?.actor?.type !== "agent" || !ctx?.agentId) return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  try {
    const passport = await getSmartphonePassport(passportParam(req), { kind: "public" });
    return jsonResponse(200, { data: { passport } }, { "Cache-Control": "private, no-store" });
  } catch (error) { return passportError(error); }
}
export default withApiMiddlewares(handler, { routeGroup: "listings.read", enableIdempotency: false });
