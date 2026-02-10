import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { errorPayload } from "../../../../server/http/errors";

import { handler as stageHandler } from "../../../../server/chat/commands-stage";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req: any, res: any, ctx: any) {
  const raw = resolveParam(req.query?.command);
  const command = raw ? String(raw) : "";

  if (command === "commands:stage") {
    return stageHandler(req, res, ctx);
  }

  return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
}

export default withApiMiddlewares(handler);

