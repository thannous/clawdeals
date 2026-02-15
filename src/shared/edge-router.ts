export type EdgeRouterEnv = {
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  MARKETING_HOST?: string;
  WWW_HOST?: string;
};

export type EdgeRouterDecision =
  | { type: "redirect"; status: 308; location: string }
  | { type: "proxy"; target: string }
  | { type: "pass" }
  | { type: "error"; status: 500; message: string };

const LOCALE_PREFIX_RE = /^\/(en|fr|es)(?=\/|$)/;
const APP_ROUTE_PREFIXES = ["/deals", "/console", "/start", "/settings", "/auth", "/developer", "/dev", "/claim", "/device", "/pair"];

function normalizeHost(hostname: string): string {
  if (!hostname) return "";
  return String(hostname).trim().toLowerCase().split(":")[0] || "";
}

function normalizeOrigin(value: string | undefined, fallback: string): URL {
  const raw = String(value || fallback).trim();
  if (!raw) return new URL(fallback);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return new URL(raw);
  return new URL(`https://${raw}`);
}

function splitLocalePrefix(pathname: string): { localePrefix: string; rest: string } {
  const path = pathname || "/";
  const match = path.match(LOCALE_PREFIX_RE);
  if (!match?.[1]) return { localePrefix: "", rest: path };
  const localePrefix = `/${match[1]}`;
  const rest = path.slice(localePrefix.length) || "/";
  return { localePrefix, rest: rest.startsWith("/") ? rest : `/${rest}` };
}

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isAppRoute(pathnameWithoutLocale: string): boolean {
  return APP_ROUTE_PREFIXES.some((prefix) => pathMatchesPrefix(pathnameWithoutLocale, prefix));
}

function appendPathAndQuery(origin: URL, source: URL): string {
  const target = new URL(origin.toString());
  target.pathname = source.pathname;
  target.search = source.search;
  target.hash = source.hash;
  return target.toString();
}

export function resolveEdgeRouterDecision(url: URL, env: EdgeRouterEnv): EdgeRouterDecision {
  const host = normalizeHost(url.hostname);
  const marketingHost = normalizeHost(env.MARKETING_HOST || "clawdeals.com");
  const wwwHost = normalizeHost(env.WWW_HOST || `www.${marketingHost}`);
  const appOrigin = normalizeOrigin(env.APP_ORIGIN, "https://app.clawdeals.com");
  const marketingOrigin = normalizeOrigin(env.MARKETING_ORIGIN, "https://clawdeals.vercel.app");
  const { rest } = splitLocalePrefix(url.pathname);

  if (host === wwwHost) {
    const target = new URL(url.toString());
    target.hostname = marketingHost;
    target.protocol = "https:";
    return { type: "redirect", status: 308, location: target.toString() };
  }

  if (host !== marketingHost) {
    return { type: "pass" };
  }

  if (pathMatchesPrefix(rest, "/api")) {
    return { type: "proxy", target: appendPathAndQuery(appOrigin, url) };
  }

  if (isAppRoute(rest)) {
    return { type: "redirect", status: 308, location: appendPathAndQuery(appOrigin, url) };
  }

  if (normalizeHost(marketingOrigin.hostname) === host) {
    return {
      type: "error",
      status: 500,
      message: "MARKETING_ORIGIN must not point to the routed marketing host; use a direct origin host."
    };
  }

  return { type: "proxy", target: appendPathAndQuery(marketingOrigin, url) };
}
