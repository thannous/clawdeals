import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../../server/middleware/console-ops-identity";
import { handler } from "../../../../v1/disputes/[dispute_id]/evidence/[evidence_item_id]";

export default injectConsoleOpsOwner(
  withApiMiddlewares(handler, { routeGroup: "console.disputes.read", enableIdempotency: false })
);
