import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { getPolicyOrDefault, upsertPolicy } from "../../../server/services/policies";
import { validatePolicyInput } from "../../../server/policy/policy";
import { isUuid } from "../../../server/utils/validators";

function parseIfMatch(req) {
  const headerValue = req.headers["if-match"];
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^W\//i, "").replace(/^\"|\"$/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  if (Number.isNaN(parsed)) {
    return { error: "If-Match must be an integer policy version" };
  }
  return { value: parsed };
}

export async function handler(req, res, ctx) {
  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  if (req.method === "GET") {
    try {
      const policy = await getPolicyOrDefault(ownerId);
      return jsonResponse(200, { data: policy.policy_json }, { "Cache-Control": "no-store" });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (req.method === "PUT") {
    const policyInput = req.body || {};
    const errors = validatePolicyInput(policyInput);
    if (errors.length) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid policy payload", errors));
    }

    const ifMatch = parseIfMatch(req);
    if (ifMatch?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", ifMatch.error));
    }
    const expectedVersion =
      ifMatch?.value ?? (Number.isInteger(policyInput.version) ? policyInput.version : null);

    try {
      const policy = await upsertPolicy({ ownerId, policy: policyInput, expectedVersion });
      if (ctx) {
        ctx.auditEvent = "policy.updated";
        ctx.policy = {
          decision: "N_A",
          policy_version: policy.version
        };
      }
      return jsonResponse(200, { data: policy.policy_json }, { "Cache-Control": "no-store" });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  return methodNotAllowed(["GET", "PUT"]);
}

export default withApiMiddlewares(handler);
