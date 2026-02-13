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

  // Must match an allowed prefix
  const allowed = ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  if (!allowed) return DEFAULT_REDIRECT;

  return trimmed;
}
