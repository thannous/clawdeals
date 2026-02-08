import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { upsertPspConfig } from "../../../../../server/services/psp-config";
import { isUuid } from "../../../../../server/utils/validators";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseNonEmptyString(value, name) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function parseInteger(value, name) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

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

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const body = req.body || {};

  try {
    const provider = parseNonEmptyString(body.provider, "provider");
    const mode = parseNonEmptyString(body.mode, "mode");
    const webhookSecretRef = parseNonEmptyString(body.webhook_secret_ref, "webhook_secret_ref");
    const platformFeeBpsDefault = parseInteger(body.platform_fee_bps_default, "platform_fee_bps_default");

    if (provider !== "mock") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "provider must be 'mock'"));
    }
    if (mode !== "sandbox" && mode !== "production") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "mode must be 'sandbox' or 'production'"));
    }
    if (!webhookSecretRef.startsWith("env:")) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "webhook_secret_ref must start with 'env:'"));
    }
    if (platformFeeBpsDefault < 0 || platformFeeBpsDefault > 2000) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "platform_fee_bps_default must be between 0 and 2000"));
    }

    if (ctx) {
      ctx.auditEvent = "psp.configured";
      ctx.body = {
        provider,
        mode,
        webhook_secret_ref: webhookSecretRef,
        platform_fee_bps_default: platformFeeBpsDefault
      };
    }

    const config = await upsertPspConfig({
      provider,
      mode,
      webhookSecretRef,
      platformFeeBpsDefault
    });

    return jsonResponse(200, {
      status: "configured",
      provider: config.provider,
      mode: config.mode
    });
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "ops.psp.write" });

