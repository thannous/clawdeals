function normalizeBaseUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

export function getPublicAppUrl(): string {
  // NEXT_PUBLIC_* is embedded at build time by Next.js.
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || "");
  return configured || "https://app.clawdeals.com";
}

export function getPublicAppEntryPath(): string {
  // Build-time config for marketing -> app deep links.
  // Examples: "/deals" (default), "/console".
  const raw = String(process.env.NEXT_PUBLIC_APP_ENTRY_PATH || "").trim();
  if (!raw) return "/deals";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function getPublicApiBaseUrl(): string {
  // When set, landing can call the API cross-origin (e.g. www -> app).
  // When empty, callers should use relative URLs (same-origin).
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || "");
}

export function getPublicSseBaseUrl(): string {
  // Optional override for SSE if the app is hosted somewhere that does not support long-lived connections well.
  // When empty, callers should use relative URLs (same-origin).
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SSE_BASE_URL || "");
}

export function joinUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const p = String(path || "");
  if (!base) return p;
  if (!p) return base;
  if (p.startsWith("/")) return `${base}${p}`;
  return `${base}/${p}`;
}
