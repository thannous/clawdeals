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
  const candidates = buildCookieNameVariants(name);
  for (const candidate of candidates) {
    if (cookies[candidate]) return cookies[candidate];
  }
  return null;
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

function normalizeHostDomain(host: any): string | null {
  const raw = normalizeNonEmptyString(host);
  if (!raw) return null;
  // Proxies can send a comma-separated list.
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;

  // Strip port, preserving IPv6 bracket form.
  if (first.startsWith("[")) {
    const idx = first.indexOf("]");
    if (idx === -1) return null;
    return first.slice(1, idx).trim().toLowerCase() || null;
  }

  const withoutPort = first.split(":")[0]?.trim();
  return (withoutPort || "").toLowerCase() || null;
}

function isIpLike(host: string): boolean {
  // Good enough for our best-effort cookie clearing (avoid doing "parent domain" logic).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(":")) return true; // IPv6
  return false;
}

function buildCookieNameVariants(name: string): string[] {
  const names = new Set<string>();
  const raw = String(name || "").trim();
  if (!raw) return [];

  let base = raw;
  if (base.startsWith("__Secure-")) base = base.slice("__Secure-".length);
  if (base.startsWith("__Host-")) base = base.slice("__Host-".length);
  base = base.trim();

  names.add(raw);
  if (base) {
    names.add(base);
    names.add(`__Secure-${base}`);
    names.add(`__Host-${base}`);
  }

  return Array.from(names);
}

function buildDomainCandidates(configuredDomain: string | null, host: any): (string | null)[] {
  const domains = new Set<string>();

  const addDomain = (value: string | null) => {
    if (value === null) {
      domains.add("__HOST_ONLY__");
      return;
    }
    const normalized = normalizeNonEmptyString(value);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    domains.add(lower);
    domains.add(lower.replace(/^\./, ""));
    domains.add(lower.startsWith(".") ? lower : `.${lower}`);
  };

  addDomain(null);

  if (configuredDomain) {
    addDomain(configuredDomain);
  }

  const hostDomain = normalizeHostDomain(host);
  if (hostDomain && hostDomain !== "localhost" && !isIpLike(hostDomain)) {
    const parts = hostDomain.split(".").filter(Boolean);
    if (parts.length >= 3) {
      addDomain(parts.slice(1).join("."));
    }
  }

  return Array.from(domains).map((value) => (value === "__HOST_ONLY__" ? null : value));
}

function buildPathCandidates(configuredPath: string): string[] {
  const paths = new Set<string>();

  const addPath = (value: any) => {
    const normalized = normalizeNonEmptyString(value);
    if (!normalized) return;
    const trimmed = normalized.trim();
    const ensured = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    paths.add(ensured);
  };

  addPath(configuredPath);
  addPath("/");
  addPath("/api");
  addPath("/api/v1");

  return Array.from(paths);
}

// Some browsers can end up with multiple cookies with the same name but different Path/Domain
// (e.g. older deployments / misconfigured env). Clearing only one variant can make logout appear
// to "not work" because another cookie is still sent to /api/*.
export function buildOwnerSessionClearCookies(options: { secure?: boolean; host?: string | null } = {}) {
  const name = resolveCookieName();
  const configuredDomain = resolveCookieDomain();
  const configuredPath = resolveCookiePath();
  const resolvedSecure = typeof options.secure === "boolean" ? options.secure : resolveCookieSecure();
  const baseSameSite = resolveCookieSameSite();

  const names = buildCookieNameVariants(name);
  const domains = buildDomainCandidates(configuredDomain, options.host);
  const paths = buildPathCandidates(configuredPath);

  const cookies: string[] = [];

  for (const cookieName of names) {
    const isHostCookie = cookieName.startsWith("__Host-");
    const isSecureCookie = isHostCookie || cookieName.startsWith("__Secure-");
    const cookieSecure = isSecureCookie ? true : resolvedSecure;
    const sameSite = baseSameSite === "None" && !cookieSecure ? "Lax" : baseSameSite;

    if (isHostCookie) {
      // __Host- cookies must be Secure, Path=/, and MUST NOT include a Domain attribute.
      cookies.push(
        serializeCookie(cookieName, "", {
          httpOnly: true,
          secure: true,
          sameSite,
          path: "/",
          expires: new Date(0),
          maxAge: 0
        })
      );
      continue;
    }

    for (const domain of domains) {
      for (const path of paths) {
        cookies.push(
          serializeCookie(cookieName, "", {
            httpOnly: true,
            secure: cookieSecure,
            sameSite,
            domain: domain || undefined,
            path,
            expires: new Date(0),
            maxAge: 0
          })
        );
      }
    }
  }

  return cookies;
}
