import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { errorPayload } from "../../../../server/http/errors";
import { methodNotAllowed } from "../../../../server/http/methods";
import { getSmartphoneComparison } from "../../../../server/services/smartphone-comparison";

export async function handler(req: any) {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  try {
    const items = await getSmartphoneComparison(req.query?.ids);
    return jsonResponse(200, { data: { items } }, { "Cache-Control": "private, no-store" });
  } catch (error: any) {
    const invalid = error?.status === 400 && error?.code === "VALIDATION_ERROR";
    return jsonResponse(invalid ? 400 : 500, errorPayload(invalid ? "VALIDATION_ERROR" : "COMPARISON_UNAVAILABLE", invalid ? error.message : "Unable to load the smartphone comparison."), { "Cache-Control": "private, no-store" });
  }
}
export default withApiMiddlewares(handler, { routeGroup: "smartphone_comparison.public.read", enableIdempotency: false });
