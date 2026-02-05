import crypto from "crypto";

function safeHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function getClientIp(req) {
  const forwarded = safeHeader(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = safeHeader(req, "x-real-ip");
  if (realIp) return realIp;
  return req.socket?.remoteAddress || "0.0.0.0";
}

export function createRequestContext(req) {
  const requestId = safeHeader(req, "x-request-id") || crypto.randomUUID();
  const method = req.method || "GET";
  const path = req.url ? req.url.split("?")[0] : "";

  return {
    requestId,
    startedAt: new Date(),
    ip: getClientIp(req),
    userAgent: safeHeader(req, "user-agent") || "",
    method,
    path,
    query: req.query || {},
    body: req.body,
    canonicalBody: "",
    actor: null,
    ownerId: null,
    agentId: null,
    rateLimit: null,
    idempotency: null,
    auditEvent: null,
    outcome: null,
    response: null
  };
}

export function setCanonicalBody(ctx, canonicalBody) {
  ctx.canonicalBody = canonicalBody || "";
}
