import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSandboxHostRequest } from "./src/shared/marketing-request";

type SupportedLocale = "fr" | "en" | "es";

const SUPPORTED_LOCALES: SupportedLocale[] = ["fr", "en", "es"];
const DEFAULT_LOCALE: SupportedLocale = "en";

function normalizeHost(hostname: string): string {
  if (!hostname) return "";
  // Strip port if present.
  return String(hostname).trim().toLowerCase().split(":")[0] || "";
}

function splitLocalePrefix(pathname: string): { localePrefix: string; rest: string } {
  const path = pathname || "/";
  const match = path.match(/^\/(fr|en|es)(?=\/|$)/);
  if (!match?.[1]) return { localePrefix: "", rest: path };
  const localePrefix = `/${match[1]}`;
  const rest = path.slice(localePrefix.length) || "/";
  return { localePrefix, rest: rest.startsWith("/") ? rest : `/${rest}` };
}

function isRootPath(restPath: string): boolean {
  return restPath === "/" || restPath === "";
}

function isAppRoute(restPath: string): boolean {
  return (
    restPath === "/start" ||
    restPath === "/settings" ||
    restPath.startsWith("/settings/") ||
    restPath.startsWith("/developer") ||
    restPath === "/dev/webmcp" ||
    restPath === "/deals" ||
    restPath.startsWith("/deals/") ||
    restPath === "/my" ||
    restPath.startsWith("/my/") ||
    restPath === "/pair" ||
    restPath.startsWith("/pair/") ||
    restPath === "/keys" ||
    restPath.startsWith("/keys/") ||
    restPath === "/claim" ||
    restPath.startsWith("/claim/") ||
    restPath === "/device" ||
    restPath.startsWith("/device/") ||
    restPath === "/auth" ||
    restPath.startsWith("/auth/") ||
    restPath === "/console" ||
    restPath.startsWith("/console/") ||
    restPath === "/api" ||
    restPath.startsWith("/api/") ||
    restPath === "/robots.txt" ||
    restPath === "/sitemap.xml"
  );
}

function isAppSectionRoute(restPath: string): boolean {
  return (
    restPath === "/start" ||
    restPath === "/settings" ||
    restPath.startsWith("/settings/") ||
    restPath.startsWith("/developer") ||
    restPath === "/dev/webmcp" ||
    restPath === "/deals" ||
    restPath.startsWith("/deals/") ||
    restPath === "/my" ||
    restPath.startsWith("/my/") ||
    restPath === "/pair" ||
    restPath.startsWith("/pair/") ||
    restPath === "/keys" ||
    restPath.startsWith("/keys/") ||
    restPath === "/claim" ||
    restPath.startsWith("/claim/") ||
    restPath === "/device" ||
    restPath.startsWith("/device/") ||
    restPath === "/auth" ||
    restPath.startsWith("/auth/") ||
    restPath === "/console" ||
    restPath.startsWith("/console/") ||
    restPath === "/api" ||
    restPath.startsWith("/api/")
  );
}

function isStaticPath(restPath: string): boolean {
  // Static assets must never be bounced across domains; that can trigger CORS errors
  // (e.g., manifest fetch) and breaks browser caching.
  return (
    restPath.startsWith("/_next/") ||
    restPath === "/favicon.ico" ||
    restPath === "/favicon.svg" ||
    restPath === "/site.webmanifest"
  );
}

function parseSupportedLocale(raw: string | null | undefined): SupportedLocale | null {
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return null;
  const primary = normalized.split(";")[0]?.split("-")[0];
  if (!primary) return null;
  return SUPPORTED_LOCALES.includes(primary as SupportedLocale) ? (primary as SupportedLocale) : null;
}

function localePrefixFor(locale: SupportedLocale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

function parseAcceptLanguage(header: string | null): SupportedLocale | null {
  if (!header) return null;

  const ranked = header
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.split(";");
      const locale = parseSupportedLocale(tag);
      if (!locale) return null;

      const qParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1] || "1") : 1;
      const quality = Number.isFinite(q) ? q : 0;
      return { locale, quality, index };
    })
    .filter((item): item is { locale: SupportedLocale; quality: number; index: number } => item !== null)
    .sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.index - b.index;
    });

  return ranked[0]?.locale || null;
}

function resolveLocalePrefix(request: NextRequest, localePrefix: string): string {
  if (localePrefix) return localePrefix;

  const cookieLocale = parseSupportedLocale(request.cookies.get("NEXT_LOCALE")?.value);
  if (cookieLocale) return localePrefixFor(cookieLocale);

  const headerLocale = parseAcceptLanguage(request.headers.get("accept-language"));
  if (headerLocale) return localePrefixFor(headerLocale);

  return localePrefixFor(DEFAULT_LOCALE);
}

export function proxy(request: NextRequest) {
  if (isSandboxHostRequest(request)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, follow");
    return response;
  }
  const url = request.nextUrl;
  const hostname = normalizeHost(url.hostname || request.headers.get("host") || "");
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host") || "");
  const edgeProxyMarker = String(request.headers.get("x-edge-router-proxy") || "").trim().toLowerCase();

  const appHost = normalizeHost(process.env.APP_HOST || "app.clawdeals.com");
  const marketingHosts = (process.env.MARKETING_HOSTS || "clawdeals.com,www.clawdeals.com")
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);

  // Don’t apply domain redirects in dev or on unknown hosts.
  if (!hostname || hostname === "localhost") {
    return NextResponse.next();
  }

  // Be defensive: env vars can be misconfigured. Keep app host behavior stable.
  const isAppHost = hostname === appHost || hostname === "app.clawdeals.com";
  const isMarketingHost =
    marketingHosts.includes(hostname) || hostname === "clawdeals.com" || hostname === "www.clawdeals.com";

  const { localePrefix, rest } = splitLocalePrefix(url.pathname);

  if (isStaticPath(rest)) {
    return NextResponse.next();
  }

  // Prefer apex as the canonical marketing host when both are configured.
  const preferredMarketingHost = marketingHosts.includes("clawdeals.com")
    ? "clawdeals.com"
    : marketingHosts.includes("www.clawdeals.com")
      ? "www.clawdeals.com"
      : marketingHosts[0];
  const isForwardedFromMarketingHost =
    forwardedHost === preferredMarketingHost ||
    marketingHosts.includes(forwardedHost) ||
    forwardedHost === "clawdeals.com" ||
    forwardedHost === "www.clawdeals.com";
  const isEdgeProxyMarked = edgeProxyMarker === "marketing" || edgeProxyMarker === "1";
  const isEdgeProxiedMarketingRequest = isEdgeProxyMarked || (isForwardedFromMarketingHost && edgeProxyMarker === "");

  // Vercel default domains (preview/prod) should never be canonical; always bounce to custom domains.
  // This prevents indexing and keeps cookies/origins stable.
  if (!isAppHost && !isMarketingHost && hostname.endsWith(".vercel.app")) {
    // Requests proxied from the Cloudflare marketing host must be served directly,
    // otherwise they bounce back to clawdeals.com and create redirect loops.
    if (isEdgeProxiedMarketingRequest && !isAppSectionRoute(rest)) {
      return NextResponse.next();
    }

    const target = new URL(url.toString());
    target.hostname = isAppSectionRoute(rest) ? appHost : (preferredMarketingHost || appHost);
    target.protocol = "https:";
    return NextResponse.redirect(target, 308);
  }

  // App host: default entry point is the app (not the marketing landing).
  if (isAppHost) {
    // Cloudflare may proxy marketing content through the app origin when no dedicated
    // Vercel marketing origin exists. In that case we must serve non-app routes here.
    if (isEdgeProxiedMarketingRequest && !isAppSectionRoute(rest)) {
      return NextResponse.next();
    }

    // Default to self-serve onboarding unless configured otherwise.
    const appEntry = process.env.APP_ENTRY_PATH || "/start";
    if (isRootPath(rest)) {
      const target = new URL(url.toString());
      const entryPath = appEntry.startsWith("/") ? appEntry : `/${appEntry}`;
      target.pathname = `${resolveLocalePrefix(request, localePrefix)}${entryPath}`;
      target.protocol = "https:";
      return NextResponse.redirect(target, 308);
    }

    // If someone hits a non-app route on the app host, bounce back to marketing.
    if (!isAppRoute(rest)) {
      const target = new URL(url.toString());
      target.hostname = preferredMarketingHost || hostname;
      target.protocol = "https:";
      return NextResponse.redirect(target, 308);
    }

    return NextResponse.next();
  }

  // Marketing host: keep "/" but bounce app routes to the app subdomain.
  // App host always wins if misconfigured (e.g. app domain accidentally included in MARKETING_HOSTS).
  if (isMarketingHost) {
    const shouldBounceToApp =
      rest.startsWith("/console") ||
      rest.startsWith("/deals") ||
      rest === "/my" ||
      rest.startsWith("/my/") ||
      rest === "/pair" ||
      rest.startsWith("/pair/") ||
      rest === "/keys" ||
      rest.startsWith("/keys/") ||
      rest.startsWith("/start") ||
      rest.startsWith("/settings") ||
      rest.startsWith("/auth") ||
      rest.startsWith("/developer") ||
      rest.startsWith("/dev/") ||
      rest.startsWith("/claim") ||
      rest.startsWith("/device");

    if (shouldBounceToApp) {
      const target = new URL(url.toString());
      target.hostname = appHost;
      target.protocol = "https:";
      return NextResponse.redirect(target, 308);
    }

    // Canonicalize marketing host to avoid duplicate content and inconsistent social cards.
    if (preferredMarketingHost && hostname !== preferredMarketingHost) {
      const target = new URL(url.toString());
      target.hostname = preferredMarketingHost;
      target.protocol = "https:";
      return NextResponse.redirect(target, 308);
    }
    return NextResponse.next();
  }

  if (!isAppHost && !isMarketingHost) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
