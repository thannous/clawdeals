import { jsonResponse } from "./response";
import { errorPayload } from "./errors";
import { isUuid } from "../utils/validators";

export function requireMissionOwner(ctx: any) {
  if (ctx?.authError) return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  if (ctx?.actor?.type !== "owner" || !isUuid(ctx?.ownerId)) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  return null;
}

export function missionValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

export function missionLimit(raw: any, fallback = 50, max = 100) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = String(missionValue(raw));
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw Object.assign(new Error(`limit must be between 1 and ${max}`), { status: 400, code: "VALIDATION_ERROR" });
  }
  return limit;
}

export function missionError(error: any) {
  return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message), { "Cache-Control": "no-store" });
}
