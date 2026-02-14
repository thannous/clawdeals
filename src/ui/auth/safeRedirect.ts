const ALLOWED_PREFIXES = [
  "/claim/",
  "/settings/",
  "/start",
  "/deals",
  "/console",
  "/explore",
  "/auth/"
];

const DEFAULT_REDIRECT = "/settings/account";
const LOCALE_PREFIX_PATTERN = /^\/[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*(?=\/|$)/;

function stripLocalePrefix(pathname: string): string {
  const withoutLocale = pathname.replace(LOCALE_PREFIX_PATTERN, "");
  return withoutLocale || "/";
}

/**
 * Validate a `?next=` redirect target to prevent open-redirect attacks.
 * Only relative paths with an allowed prefix are accepted.
 */
export function safeRedirectUrl(next: unknown): string {
  if (typeof next !== "string") return DEFAULT_REDIRECT;

  const trimmed = next.trim();

  // Block empty, protocol-relative (//), absolute URLs, and control chars
  if (!trimmed || trimmed.startsWith("//") || /^[a-z]+:/i.test(trimmed) || /[\x00-\x1f]/.test(trimmed)) {
    return DEFAULT_REDIRECT;
  }

  // Must start with /
  if (!trimmed.startsWith("/")) return DEFAULT_REDIRECT;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "http://localhost");
  } catch {
    return DEFAULT_REDIRECT;
  }

  const normalizedPath = stripLocalePrefix(parsed.pathname);

  // Must match an allowed prefix
  const allowed = ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
  if (!allowed) return DEFAULT_REDIRECT;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
