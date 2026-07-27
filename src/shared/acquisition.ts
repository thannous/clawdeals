import { resolveSupportedLocale, stripLocalePrefix, type SupportedLocale } from "./i18n";

export const ACQUISITION_QUERY_PARAM = "acq_id";

export const ACQUISITION_EVENT_NAMES = [
  "landing_view",
  "organic_entry",
  "connect_cta_clicked",
  "agent_connected",
  "watchlist_created",
  "first_match",
  "d7_retained"
] as const;

export type AcquisitionEventName = (typeof ACQUISITION_EVENT_NAMES)[number];
export type PublicAcquisitionEventName =
  | "landing_view"
  | "organic_entry"
  | "connect_cta_clicked";

export const PUBLIC_ACQUISITION_EVENT_NAMES: readonly PublicAcquisitionEventName[] = [
  "landing_view",
  "organic_entry",
  "connect_cta_clicked"
];

export const ACQUISITION_CTA_LOCATIONS = [
  "navbar",
  "hero",
  "showcase_deals",
  "showcase_marketplace",
  "feature_footer",
  "explore_card",
  "explore_footer",
  "mcp",
  "browse",
  "landing_activation",
  "mcp_activation",
  "openclaw_activation",
  "comparison_activation",
  "other"
] as const;

export type AcquisitionCtaLocation = (typeof ACQUISITION_CTA_LOCATIONS)[number];

const SEARCH_HOST_PATTERNS = [
  /(^|\.)google\./,
  /(^|\.)bing\.com$/,
  /(^|\.)duckduckgo\.com$/,
  /(^|\.)search\.yahoo\./,
  /(^|\.)ecosia\.org$/,
  /(^|\.)search\.brave\.com$/,
  /(^|\.)yandex\./,
  /(^|\.)baidu\.com$/
];

const MARKETING_HOSTS = new Set(["clawdeals.com", "www.clawdeals.com"]);

export type AcquisitionAttribution = {
  source: string;
  medium: string;
  campaign: string | null;
  referrerHost: string | null;
  isOrganic: boolean;
};

export function localeToMarketCode(locale: unknown): "FR" | "GB" | "ES" {
  const resolved = resolveSupportedLocale(locale);
  if (resolved === "fr") return "FR";
  if (resolved === "es") return "ES";
  return "GB";
}

export function normalizeAcquisitionId(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function sanitizeAttributionValue(value: unknown, maxLength = 80): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength) return null;
  return /^[a-z0-9._-]+$/.test(normalized) ? normalized : null;
}

export function normalizeLandingPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withoutQuery = value.split(/[?#]/, 1)[0] || "/";
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  if (normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export function resolveAcquisitionAttribution(
  pageUrl: string,
  referrer: string | null | undefined
): AcquisitionAttribution {
  const url = new URL(pageUrl);
  const utmSource = sanitizeAttributionValue(url.searchParams.get("utm_source"));
  const utmMedium = sanitizeAttributionValue(url.searchParams.get("utm_medium"));
  const campaign = sanitizeAttributionValue(url.searchParams.get("utm_campaign"));

  let referrerHost: string | null = null;
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "") || null;
    } catch {
      referrerHost = null;
    }
  }

  if (utmSource || utmMedium) {
    const source = utmSource || "unknown";
    const medium = utmMedium || "campaign";
    return {
      source,
      medium,
      campaign,
      referrerHost,
      isOrganic: medium === "organic"
    };
  }

  if (!referrerHost) {
    return {
      source: "direct",
      medium: "none",
      campaign: null,
      referrerHost: null,
      isOrganic: false
    };
  }

  const isOrganic = SEARCH_HOST_PATTERNS.some((pattern) => pattern.test(referrerHost!));
  if (isOrganic) {
    return {
      source: referrerHost,
      medium: "organic",
      campaign: null,
      referrerHost,
      isOrganic: true
    };
  }

  const currentHost = url.hostname.toLowerCase().replace(/^www\./, "");
  if (referrerHost === currentHost) {
    return {
      source: "internal",
      medium: "navigation",
      campaign: null,
      referrerHost,
      isOrganic: false
    };
  }

  return {
    source: referrerHost,
    medium: "referral",
    campaign: null,
    referrerHost,
    isOrganic: false
  };
}

export function isMarketingSurface(hostname: string, pathname: string): boolean {
  const normalizedHost = String(hostname || "").trim().toLowerCase().split(":")[0] || "";
  if (!MARKETING_HOSTS.has(normalizedHost)) return false;
  const rest = stripLocalePrefix(normalizeLandingPath(pathname) || "/");
  return ![
    "/api",
    "/auth",
    "/claim",
    "/console",
    "/deals",
    "/dev",
    "/developer",
    "/device",
    "/keys",
    "/my",
    "/pair",
    "/settings",
    "/start"
  ].some((prefix) => rest === prefix || rest.startsWith(`${prefix}/`));
}

export function isAppEntryUrl(url: URL): boolean {
  const rest = stripLocalePrefix(url.pathname);
  if (rest !== "/start") return false;
  const host = url.hostname.toLowerCase();
  return host === "app.clawdeals.com" || MARKETING_HOSTS.has(host);
}

export function resolveEventLocale(value: unknown): SupportedLocale {
  return resolveSupportedLocale(value);
}
