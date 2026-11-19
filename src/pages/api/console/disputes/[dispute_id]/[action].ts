import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { handler } from "../../../v1/disputes/[dispute_id]/[action]";

// The reviewer console reuses the v1 dispute handler under the console ops
// identity: `review` (GET) and `resolve` (POST).
const readHandler = injectConsoleOpsOwner(
  withApiMiddlewares(handler, { routeGroup: "console.disputes.read", enableIdempotency: false })
);
const writeHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.disputes.write" }));

export default function consoleDisputeAction(req, res) {
  if (req.method === "GET") return readHandler(req, res);
  return writeHandler(req, res);
}
