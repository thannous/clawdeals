import { errorPayload } from "./errors";
import { jsonResponse } from "./response";
import { isUuid } from "../utils/validators";

export function passportParam(req: any, key = "id"): string {
  const value = req.query?.[key];
  if (typeof value !== "string" || !isUuid(value)) throw Object.assign(new Error(`Invalid ${key}`), { status: 400, code: "VALIDATION_ERROR" });
  return value;
}

export function requirePassportOwner(req: any, ctx: any, write = false) {
  if (ctx?.authError) return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  // These owner-only flows use a real owner session, including in development.
  if (ctx?.actor?.type !== "owner" || !isUuid(ctx?.ownerId) || !ctx?.ownerSessionId) return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner session required"));
  if (!write) return null;
  const header = (name: string) => typeof req.headers?.[name] === "string" ? req.headers[name] as string : "";
  const source = header("origin") || header("referer");
  const host = (header("x-forwarded-host") || header("host")).split(",")[0].trim();
  const protocol = (header("x-forwarded-proto") || (req.socket?.encrypted ? "https" : "http")).split(",")[0].trim();
  try {
    if (!host || !source || new URL(source).origin !== `${protocol}://${host}` || header("sec-fetch-site") === "cross-site") throw new Error("origin");
  } catch {
    return jsonResponse(403, errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
  }
  if (req.method !== "DELETE" && header("content-type").split(";")[0].trim().toLowerCase() !== "application/json") return jsonResponse(415, errorPayload("UNSUPPORTED_MEDIA_TYPE", "Use application/json"));
  return null;
}

export function passportError(error: any) {
  return jsonResponse(error?.status || 500, errorPayload(error?.code || "PASSPORT_ERROR", (error?.status && error.status < 500) || error?.code === "PASSPORT_UNAVAILABLE" ? error.message : "Unable to access the smartphone passport"), { "Cache-Control": "private, no-store" });
}

export function sendPassportPhoto(res: any, bytes: Buffer) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Content-Disposition", "inline; filename=smartphone-photo.jpg");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.end(bytes);
}
