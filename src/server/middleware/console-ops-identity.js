const DEFAULT_CONSOLE_OPS_OWNER_ID = "00000000-0000-4000-a000-000000000000";

function readHeader(headers, name) {
  if (!headers) return null;
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || null;
  if (direct) return direct;
  const lower = headers[String(name).toLowerCase()];
  if (Array.isArray(lower)) return lower[0] || null;
  return lower || null;
}

function setHeader(headers, name, value) {
  if (!headers) return;
  headers[String(name).toLowerCase()] = value;
}

function isEnabledFlag(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function respondNotFound(res) {
  const payload = { error: { code: "NOT_FOUND", message: "Not found" } };
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(404).json(payload);
  }
  if (res) {
    res.statusCode = 404;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
    }
    if (typeof res.end === "function") {
      res.end(JSON.stringify(payload));
    }
  }
  return null;
}

/**
 * Console endpoints are called by the browser. For v0 we treat them as ops/human
 * by injecting an owner identity server-side, without exposing it to the client.
 */
export function injectConsoleOpsOwner(apiHandler, options = {}) {
  const ownerId = options.ownerId || process.env.CONSOLE_OPS_OWNER_ID || DEFAULT_CONSOLE_OPS_OWNER_ID;

  return async function consoleOpsOwnerInjected(req, res) {
    // Avoid accidentally shipping unauthenticated console ops endpoints in production.
    if (process.env.NODE_ENV === "production" && !isEnabledFlag(process.env.CONSOLE_OPS_ENABLED)) {
      return respondNotFound(res);
    }

    if (!req.headers) {
      req.headers = {};
    }

    const existing = readHeader(req.headers, "x-owner-id");
    if (!existing) {
      setHeader(req.headers, "x-owner-id", ownerId);
    }

    return apiHandler(req, res);
  };
}
