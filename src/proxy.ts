import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type SupportedLocale = "fr" | "en" | "es";
const SUPPORTED_LOCALES: SupportedLocale[] = ["fr", "en", "es"];
const DEFAULT_LOCALE: SupportedLocale = "en";

function normalizeHost(host: string): string {
  return String(host).trim().toLowerCase().split(":")[0] || "";
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

function resolveLocalePrefix(request: NextRequest): string {
  // Next normalizes pathname before Proxy runs; nextUrl.locale retains the URL locale.
  const rawPath = new URL(request.url).pathname;
  const explicit = rawPath.match(/^\/(fr|en|es)(?=\/|$)/)?.[1];
  if (explicit) return localePrefixFor(explicit as SupportedLocale);
  if (request.nextUrl.locale && request.nextUrl.locale !== DEFAULT_LOCALE) {
    return localePrefixFor(request.nextUrl.locale as SupportedLocale);
  }

  const cookieLocale = parseSupportedLocale(request.cookies.get("NEXT_LOCALE")?.value);
  if (cookieLocale) return localePrefixFor(cookieLocale);

  const headerLocale = parseAcceptLanguage(request.headers.get("accept-language"));
  if (headerLocale) return localePrefixFor(headerLocale);

  return localePrefixFor(DEFAULT_LOCALE);
}

export function proxy(request: NextRequest) {
  const hostname = normalizeHost(request.headers.get("host") || request.nextUrl.hostname);
  const appHost = normalizeHost(process.env.APP_HOST || "app.clawdeals.com");
  if (hostname !== appHost && hostname !== "app.clawdeals.com") return NextResponse.next();

  const marker = String(request.headers.get("x-edge-router-proxy") || "").trim().toLowerCase();
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host") || "");
  const marketingHosts = (process.env.MARKETING_HOSTS || "clawdeals.com,www.clawdeals.com")
    .split(",").map(normalizeHost).filter(Boolean);
  const forwardedMarketing = [...marketingHosts, "clawdeals.com", "www.clawdeals.com"].includes(forwardedHost);
  if (marker === "marketing" || marker === "1" || (forwardedMarketing && !marker)) return NextResponse.next();

  const appEntry = process.env.APP_ENTRY_PATH || "/start";
  const target = new URL(request.url);
  target.protocol = "https:";
  target.host = hostname;
  target.port = "";
  target.pathname = `${resolveLocalePrefix(request)}${appEntry.startsWith("/") ? appEntry : `/${appEntry}`}`;
  return NextResponse.redirect(target, 308);
}

// Only locale roots need dynamic language selection. All other host redirects are declarative.
export const config = {
  matcher: [{
    source: "/:locale(fr|en|es)?",
    locale: false,
    missing: [{
      type: "header",
      key: "x-edge-router-proxy",
      value: "\\s*(?:[mM][aA][rR][kK][eE][tT][iI][nN][gG]|1)\\s*"
    }]
  }]
};
