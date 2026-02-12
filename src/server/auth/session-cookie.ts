const DEFAULT_COOKIE_NAME = "cd_owner_session";
const DEFAULT_COOKIE_PATH = "/";
const DEFAULT_SAMESITE = "Lax";

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function resolveCookieName() {
  return process.env.OWNER_SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME;
}

function resolveCookieDomain() {
  return normalizeNonEmptyString(process.env.OWNER_SESSION_COOKIE_DOMAIN);
}

function resolveCookiePath() {
  return normalizeNonEmptyString(process.env.OWNER_SESSION_COOKIE_PATH) || DEFAULT_COOKIE_PATH;
}

function resolveCookieSecure() {
  if (process.env.OWNER_SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.OWNER_SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function resolveCookieSameSite() {
  const value = normalizeNonEmptyString(process.env.OWNER_SESSION_COOKIE_SAMESITE);
  if (!value) return DEFAULT_SAMESITE;
  const normalized = value.toLowerCase();
  if (normalized === "lax") return "Lax";
  if (normalized === "strict") return "Strict";
  if (normalized === "none") return "None";
  return DEFAULT_SAMESITE;
}

function serializeCookie(name: string, value: string, options: any = {}) {
  const segments = [`${name}=${value}`];

  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (typeof options.maxAge === "number") {
    segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}

export function parseCookieHeader(raw: any): Record<string, string> {
  if (!raw || typeof raw !== "string") return {};
  const out: Record<string, string> = {};
  const parts = raw.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readOwnerSessionCookie(req: any) {
  const header = req?.headers?.cookie ?? req?.headers?.Cookie ?? null;
  const cookies = parseCookieHeader(header);
  const name = resolveCookieName();
  if (!cookies[name]) return null;
  return cookies[name];
}

function readHeaderValue(headers: any, name: string): string | null {
  if (!headers) return null;
  const key = String(name || "").toLowerCase();
  const value = headers[key] ?? headers[name];
  if (Array.isArray(value)) return String(value[0] || "");
  if (value === undefined || value === null) return null;
  return String(value);
}

export function isSecureRequest(req: any): boolean | undefined {
  const proto = readHeaderValue(req?.headers, "x-forwarded-proto");
  if (!proto) return undefined;
  // "https" or "https,http" depending on proxies.
  const first = proto.split(",")[0]?.trim().toLowerCase();
  if (first === "https") return true;
  if (first === "http") return false;
  return undefined;
}

export function buildOwnerSessionCookie({
  token,
  expiresAt,
  secure: secureOverride
}: {
  token: string;
  expiresAt: Date;
  secure?: boolean;
}) {
  const name = resolveCookieName();
  const domain = resolveCookieDomain();
  const path = resolveCookiePath();
  let secure = typeof secureOverride === "boolean" ? secureOverride : resolveCookieSecure();
  let sameSite = resolveCookieSameSite();

  // SameSite=None requires Secure; fall back to Lax for http dev flows.
  if (sameSite === "None" && !secure) {
    sameSite = "Lax";
  }

  return serializeCookie(name, encodeURIComponent(String(token)), {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path,
    expires: expiresAt
  });
}

export function buildOwnerSessionClearCookie(options: { secure?: boolean } = {}) {
  const name = resolveCookieName();
  const domain = resolveCookieDomain();
  const path = resolveCookiePath();
  const resolvedSecure = typeof options.secure === "boolean" ? options.secure : resolveCookieSecure();
  let sameSite = resolveCookieSameSite();

  if (sameSite === "None" && !resolvedSecure) {
    sameSite = "Lax";
  }

  return serializeCookie(name, "", {
    httpOnly: true,
    secure: resolvedSecure,
    sameSite,
    domain,
    path,
    expires: new Date(0),
    maxAge: 0
  });
}

// Some browsers can end up with multiple cookies with the same name but different Path/Domain
// (e.g. older deployments / misconfigured env). Clearing only one variant can make logout appear
// to "not work" because another cookie is still sent to /api/*.
export function buildOwnerSessionClearCookies(options: { secure?: boolean } = {}) {
  const name = resolveCookieName();
  const configuredDomain = resolveCookieDomain();
  const configuredPath = resolveCookiePath();
  const resolvedSecure = typeof options.secure === "boolean" ? options.secure : resolveCookieSecure();
  let sameSite = resolveCookieSameSite();

  if (sameSite === "None" && !resolvedSecure) {
    sameSite = "Lax";
  }

  const domains = [configuredDomain, null].filter((d, i, arr) => {
    // Dedupe nulls and strings.
    if (d === null) return true;
    return arr.indexOf(d) === i;
  });

  // Clear the configured path, plus common legacy paths.
  const paths = [configuredPath, "/", "/api"].filter((p, i, arr) => arr.indexOf(p) === i);

  const cookies: string[] = [];
  for (const domain of domains) {
    for (const path of paths) {
      cookies.push(
        serializeCookie(name, "", {
          httpOnly: true,
          secure: resolvedSecure,
          sameSite,
          domain: domain || undefined,
          path,
          expires: new Date(0),
          maxAge: 0
        })
      );
    }
  }

  return cookies;
}
