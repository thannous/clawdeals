import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import {
  assertOauthDeviceUserCodeLookupAllowed,
  getOauthDeviceAuthorizationByUserCode,
  recordOauthDeviceUserCodeLookupAttempt
} from "../../../../server/services/oauth-device-authorizations";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function resolveQueryParam(value: any) {
  if (Array.isArray(value)) return value[0] || "";
  if (value === null || value === undefined) return "";
  return String(value);
}

function jsonNoStore(status: number, body: any, headers: Record<string, string> = {}) {
  return jsonResponse(status, body, {
    ...NO_STORE_HEADERS,
    ...headers
  });
}

function parsePositiveSeconds(value: any): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.ceil(parsed);
}

function resolveRetryAfterSeconds(value: any): number | null {
  const candidates = [
    value?.retry_after_seconds,
    value?.retryAfterSeconds,
    value?.details?.retry_after_seconds,
    value?.details?.retryAfterSeconds
  ];

  for (const candidate of candidates) {
    const parsed = parsePositiveSeconds(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function normalizeErrorCode(value: any) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function isLockoutSignal(value: any) {
  if (!value) return false;
  const code = normalizeErrorCode(value.code ?? value.error ?? value.reason);
  if (code.includes("LOCKOUT") || code.includes("LOCKED")) return true;
  return value.status === 429 || value.locked === true || value.lockout === true;
}

function buildLockoutResponse(value: any) {
  const retryAfterSeconds = resolveRetryAfterSeconds(value);
  const code = normalizeErrorCode(value?.code) || "DEVICE_AUTHORIZATION_LOCKED";
  const message = typeof value?.message === "string" && value.message.trim()
    ? value.message.trim()
    : "Too many attempts. Try again later.";

  const details = {
    ...(value?.details && typeof value.details === "object" ? value.details : {})
  } as Record<string, any>;
  if (retryAfterSeconds && details.retry_after_seconds === undefined) {
    details.retry_after_seconds = retryAfterSeconds;
  }

  const headers = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
  return jsonNoStore(429, errorPayload(code, message, details), headers);
}

async function runLockoutGuard(params: Record<string, any>) {
  try {
    const result = await assertOauthDeviceUserCodeLookupAllowed(params);
    if (isLockoutSignal(result)) {
      return buildLockoutResponse(result);
    }
    return null;
  } catch (error: any) {
    if (isLockoutSignal(error)) {
      return buildLockoutResponse(error);
    }
    throw error;
  }
}

async function runLockoutRecorder(params: Record<string, any>, { failOpen }: { failOpen: boolean }) {
  try {
    const result = await recordOauthDeviceUserCodeLookupAttempt(params);
    if (isLockoutSignal(result)) {
      return buildLockoutResponse(result);
    }
    return null;
  } catch (error: any) {
    if (isLockoutSignal(error)) {
      return buildLockoutResponse(error);
    }
    if (failOpen) {
      console.warn("[oauth] user_code lookup tracking failed; continuing without lockout side-effect", {
        code: error?.code,
        status: error?.status
      });
      return null;
    }
    throw error;
  }
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonNoStore(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const userCode = resolveQueryParam(req.query?.user_code ?? req.query?.userCode).trim();
  if (!userCode) {
    return jsonNoStore(400, errorPayload("VALIDATION_ERROR", "user_code is required"));
  }

  const now = new Date();
  try {
    const guardLockout = await runLockoutGuard({
      userCode,
      ip: ctx?.ip || null,
      now
    });
    if (guardLockout) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "lockout" };
      return guardLockout;
    }

    const row = await getOauthDeviceAuthorizationByUserCode({ userCode, now });

    const postSuccessLockout = await runLockoutRecorder(
      {
        userCode,
        ip: ctx?.ip || null,
        now,
        matched: true,
        success: true
      },
      { failOpen: false }
    );
    if (postSuccessLockout) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "lockout" };
      return postSuccessLockout;
    }

    return jsonNoStore(200, {
      data: {
        authorization_id: row.authorization_id,
        status: row.status,
        client_id: row.client_id,
        requested_scopes: row.requested_scopes || [],
        requested_agent_name: row.requested_agent_name || null,
        expires_at: row.expires_at || null,
        owner_id: row.owner_id || null,
        agent_id: row.agent_id || null,
        authorized_at: row.authorized_at || null,
        denied_at: row.denied_at || null
      }
    });
  } catch (error: any) {
    const postErrorLockout = await runLockoutRecorder(
      {
        userCode,
        ip: ctx?.ip || null,
        now,
        matched: false,
        success: false,
        errorCode: error?.code || null,
        errorStatus: error?.status || null
      },
      { failOpen: false }
    );
    if (postErrorLockout) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "lockout" };
      return postErrorLockout;
    }

    if (isLockoutSignal(error)) {
      if (ctx) ctx.outcome = { type: "BLOCKED", reason: "lockout" };
      return buildLockoutResponse(error);
    }

    return jsonNoStore(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.device.requests.read_ip",
  enableAudit: false,
  enableIdempotency: false
});
