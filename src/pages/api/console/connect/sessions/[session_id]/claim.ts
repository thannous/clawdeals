import { injectConsoleOpsOwner } from "../../../../../../server/middleware/console-ops-identity";
import { errorPayload } from "../../../../../../server/http/errors";

import v1Handler from "../../../../v1/connect/sessions/[session_id]/claim";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function requireSameOrigin(req: any, res: any) {
  const origin = getHeaderValue(req, "origin");
  if (!origin) return null;

  const forwardedHost = getHeaderValue(req, "x-forwarded-host");
  const hostHeader = forwardedHost ? String(forwardedHost).split(",")[0].trim() : getHeaderValue(req, "host");
  if (!hostHeader) return null;

  try {
    const originHost = new URL(String(origin)).host;
    if (originHost && originHost !== String(hostHeader)) {
      res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
      return true;
    }
  } catch {
    res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
    return true;
  }

  return null;
}

async function handler(req: any, res: any) {
  const blocked = requireSameOrigin(req, res);
  if (blocked) return;
  return v1Handler(req, res);
}

// Browser-friendly wrapper: owner identity is injected server-side for console usage.
export default injectConsoleOpsOwner(handler);

