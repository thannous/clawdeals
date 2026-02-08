import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getPspConfig } from "../../../../server/services/psp-config";
import { getPspAccountForOwner, upsertPspAccountForOwner } from "../../../../server/services/psp-accounts";
import { createPspAdapter } from "../../../../server/psp";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  const rawAction = resolveParam(req.query?.action);
  const action = rawAction ? String(rawAction) : "";

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId || !isUuid(ownerId)) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  if (req.method === "POST" && action === "psp:onboard") {
    const idempotencyKey = getHeaderValue(req, "idempotency-key");
    if (!idempotencyKey) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }

    const config = await getPspConfig();
    if (!config) {
      return jsonResponse(409, errorPayload("PSP_NOT_CONFIGURED", "PSP not configured"));
    }

    const adapter = createPspAdapter({
      provider: config.provider as any,
      mode: config.mode as any
    });

    if (ctx) {
      ctx.auditEvent = "seller.psp_onboarded";
      ctx.body = { action: "psp:onboard" };
    }

    try {
      const onboarding = await adapter.createSellerOnboarding({ ownerId });

      const account = await upsertPspAccountForOwner({
        ownerId,
        provider: adapter.provider,
        externalAccountId: onboarding.externalAccountId,
        kycStatus: onboarding.kycStatus,
        requirementsDue: onboarding.requirementsDue
      });

      return jsonResponse(200, {
        psp_account_id: account.psp_account_id,
        kyc_status: account.kyc_status,
        next_step: {
          type: "redirect",
          url: onboarding.url
        }
      });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (req.method === "GET" && action === "psp:status") {
    if (ctx) {
      ctx.auditEvent = "seller.psp_status_read";
    }

    try {
      const account = await getPspAccountForOwner(ownerId);
      if (!account) {
        return jsonResponse(404, errorPayload("PSP_ACCOUNT_NOT_FOUND", "PSP account not found"));
      }
      return jsonResponse(200, {
        psp_account_id: account.psp_account_id,
        kyc_status: account.kyc_status,
        requirements_due: account.requirements_due
      });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (action === "psp:onboard") {
    return methodNotAllowed(["POST"]);
  }
  if (action === "psp:status") {
    return methodNotAllowed(["GET"]);
  }
  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown seller action"));
}

export default withApiMiddlewares(handler);
