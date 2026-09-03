import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";

/**
 * Lightweight owner-session probe for the browser.
 *
 * Unlike `/api/v1/auth/me`, an anonymous visitor gets a 200 with
 * `authenticated: false` instead of a 401, so pages can decide whether to
 * load owner data (or redirect to login) without producing failed network
 * requests in the console. It never returns owner details.
 */
export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const authenticated = Boolean(ctx?.ownerId) && ctx?.actor?.type === "owner" && !ctx?.authError;

  return jsonResponse(
    200,
    {
      data: {
        authenticated,
        owner_id: authenticated ? ctx.ownerId : null
      }
    },
    { "Cache-Control": "no-store" }
  );
}

export default withApiMiddlewares(handler, {
  routeGroup: "auth.me.read",
  enableIdempotency: false
});
