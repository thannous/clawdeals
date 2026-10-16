import type { Cookie } from "@e2e-dev/web";

export const APP_ORIGIN = "https://app.clawdeals.com";
export const MARKETING_ORIGIN = "https://clawdeals.com";
const PROJECT = "gztfmpuqtpvncdcuhqxy";

export function validateCommerceTarget(env: Record<string, string | undefined>, appUrl: string) {
  const backend = new URL(env.SUPABASE_URL || "http://missing.invalid");
  const target = new URL(appUrl);
  const production = env.TESTERARMY_COMMERCE_PRODUCTION === "1";
  const rootOnly = (url: URL) => !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && ["http:", "https:"].includes(target.protocol);
  if (env.CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS !== PROJECT ||
    backend.origin !== `https://${PROJECT}.supabase.co` || !rootOnly(backend) ||
    new URL(env.NEXT_PUBLIC_SUPABASE_URL || backend.origin).href !== backend.href ||
    !rootOnly(target) || (production ? target.origin !== APP_ORIGIN : !local)) {
    throw new Error("Commerce requires its explicit app target and the exact opted-in disposable ClawDeals backend.");
  }
  if (production) {
    const redis = new URL(env.UPSTASH_REDIS_REST_URL || "http://missing.invalid");
    if (redis.protocol !== "https:" || !rootOnly(redis) || !env.UPSTASH_REDIS_REST_TOKEN ||
      ["localhost", "127.0.0.1", "[::1]", "missing.invalid"].includes(redis.hostname) ||
      env.TESTERARMY_REDIS_FIXTURE !== "production-real") {
      throw new Error("Production commerce requires its real HTTPS Redis service and production-real receipt mode.");
    }
  }
  return { backend, target, production };
}

export function privateDestination(next: string, origin: string) {
  const destination = new URL(next, origin);
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || destination.origin !== origin ||
    !/^(?:\/(?:fr|es))?\/(?:my|settings)(?:\/|$)/.test(destination.pathname)) {
    throw new Error("Fixture sign-in requires a private page on the app origin.");
  }
  return destination;
}

/** Preserve the attributes of the real bridge cookie; never accept unrelated cookies. */
export function bridgeCookies(headers: readonly string[], origin: string): Cookie[] {
  const target = new URL(origin);
  const cookies = headers.map(header => {
    const [pair, ...attributes] = header.split(";").map(value => value.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const fields = new Map(attributes.map(attribute => {
      const [key, ...rest] = attribute.split("=");
      return [key.toLowerCase(), rest.join("=")];
    }));
    const domain = fields.get("domain");
    const path = fields.get("path") || "/";
    const expiry = Date.parse(fields.get("expires") || "");
    const sameSite = fields.get("samesite")?.toLowerCase();
    if (separator < 1 || !/^(?:(?:__Host-|__Secure-))?cd_owner_session$/.test(name) || !value ||
      !fields.has("httponly") || path !== "/" || !Number.isFinite(expiry) || expiry <= Date.now() ||
      (target.protocol === "https:" && !fields.has("secure")) ||
      (domain && domain.replace(/^\./, "") !== target.hostname &&
        !(target.origin === APP_ORIGIN && domain.replace(/^\./, "") === "clawdeals.com")) ||
      !["strict", "lax", "none"].includes(sameSite || "")) {
      throw new Error("The real session bridge returned an unexpected owner cookie.");
    }
    return {
      name, value, ...(domain ? { domain, path } : { url: target.origin }),
      httpOnly: true, secure: fields.has("secure"), expires: Math.floor(expiry / 1000),
      sameSite: (sameSite![0].toUpperCase() + sameSite!.slice(1)) as "Strict" | "Lax" | "None"
    };
  });
  if (cookies.length !== 1) throw new Error("The real session bridge must issue exactly one owner cookie.");
  return cookies;
}

function nextData(html: string) {
  const match = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Production identity is missing Next.js build data.");
  try { return JSON.parse(match[1]) as { buildId?: string; props?: { pageProps?: { deploySha?: string } } }; }
  catch { throw new Error("Production identity has invalid Next.js build data."); }
}

export async function readProductionIdentity() {
  async function read(url: string) {
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Production identity read failed (${response.status}).`);
    return nextData(await response.text());
  }
  const app = await read(`${APP_ORIGIN}/fr/auth/login`);
  const marketing = await read(`${MARKETING_ORIGIN}/fr/webmcp-challenge`);
  const sha = marketing.props?.pageProps?.deploySha;
  if (!app.buildId || app.buildId === "development" || app.buildId !== marketing.buildId || !/^[0-9a-f]{40}$/i.test(sha || "")) {
    throw new Error("Production app and marketing must expose the same release build and a complete deployment SHA.");
  }
  return { appBuildId: app.buildId, marketingBuildId: marketing.buildId, deploySha: sha!, observedAt: new Date().toISOString() };
}
