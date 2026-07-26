import { errorPayload } from "../../../../server/http/errors";
import { methodNotAllowed } from "../../../../server/http/methods";
import { jsonResponse } from "../../../../server/http/response";
import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import {
  parsePublicAcquisitionEvent,
  recordPublicAcquisitionEvent
} from "../../../../server/services/acquisition";

export async function handler(req: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  try {
    const event = parsePublicAcquisitionEvent(req.body || {});
    await recordPublicAcquisitionEvent(event);
    return jsonResponse(202, { accepted: true });
  } catch (error: any) {
    return jsonResponse(
      error?.status || 500,
      errorPayload(error?.code || "ERROR", error?.message || "Failed to record event")
    );
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "acquisition.events_ip",
  enableAudit: false,
  enableIdempotency: false
});
