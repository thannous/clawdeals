import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { handler } from "../../v1/events/stream";

export const config = {
  api: {
    externalResolver: true,
    bodyParser: false,
    responseLimit: false
  }
};

export default injectConsoleOpsOwner(
  withApiMiddlewares(handler, {
    enableIdempotency: false,
    enableAudit: false
  })
);
