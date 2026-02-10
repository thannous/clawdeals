import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { errorPayload } from "../../../../../server/http/errors";

import oauthHandler from "../../../oauth/device/deny";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function requireSameOrigin(req: any, res: any) {
  const origin = getHeaderValue(req, "origin");
  const referer = getHeaderValue(req, "referer");
  const source = origin || referer;
  if (!source) {
    res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
    return true;
  }

  const forwardedHost = getHeaderValue(req, "x-forwarded-host");
  const hostHeader = forwardedHost ? String(forwardedHost).split(",")[0].trim() : getHeaderValue(req, "host");
  if (!hostHeader) {
    res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
    return true;
  }

  try {
    const sourceHost = new URL(String(source)).host;
    if (sourceHost && sourceHost !== String(hostHeader)) {
      res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
      return true;
    }
  } catch {
    res.status(403).json(errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
    return true;
  }

  return false;
}

async function handler(req: any, res: any) {
  const blocked = requireSameOrigin(req, res);
  if (blocked) return;
  return oauthHandler(req, res);
}

// Browser-friendly wrapper: owner identity is injected server-side for console usage.
export default injectConsoleOpsOwner(handler);
