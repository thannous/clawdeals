function readHeader(req: any, name: string): string {
  const key = String(name || "").toLowerCase();
  const fromObj =
    req?.headers?.[key] ??
    req?.headers?.[name] ??
    req?.headers?.[name.toUpperCase()] ??
    req?.headers?.[name.replace(/-/g, "_")] ??
    "";
  const fromGet = typeof req?.headers?.get === "function" ? req.headers.get(name) || req.headers.get(key) || "" : "";
  const value = fromObj || fromGet || "";
  return Array.isArray(value) ? String(value[0] || "") : String(value);
}

function normalizeHost(raw: string): string {
  if (!raw) return "";
  const first = String(raw).split(",")[0]?.trim().toLowerCase() || "";
  return first.split(":")[0] || "";
}

function configuredMarketingHosts(): string[] {
  return String(process.env.MARKETING_HOSTS || "clawdeals.com,www.clawdeals.com")
    .split(",")
    .map((h) => normalizeHost(h))
    .filter(Boolean);
}

function preferredMarketingHost(): string {
  const configured = configuredMarketingHosts();
  if (configured.includes("clawdeals.com")) return "clawdeals.com";
  return configured[0] || "clawdeals.com";
}

export function isEdgeMarketingProxyRequest(req: any): boolean {
  const marker = readHeader(req, "x-edge-router-proxy").trim().toLowerCase();
  return marker === "marketing" || marker === "1";
}

export function effectiveRequestHost(req: any): string {
  const forwardedHost = normalizeHost(readHeader(req, "x-forwarded-host"));

  if (isEdgeMarketingProxyRequest(req)) {
    const marketingHosts = configuredMarketingHosts();
    if (forwardedHost && marketingHosts.includes(forwardedHost)) {
      return forwardedHost;
    }
    return preferredMarketingHost();
  }

  return normalizeHost(forwardedHost || readHeader(req, "host"));
}

export function effectiveRequestProto(req: any): "http" | "https" {
  if (isEdgeMarketingProxyRequest(req)) return "https";
  const proto = String(readHeader(req, "x-forwarded-proto") || "https")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "http" ? "http" : "https";
}

export function marketingBaseUrlFromRequest(req: any): string {
  const configured = process.env.SITE_URL;
  if (configured && typeof configured === "string" && configured.startsWith("http")) {
    return configured.replace(/\/$/, "");
  }

  // App-host responses should still point to canonical marketing URLs.
  if (isAppHostRequest(req)) {
    return `https://${preferredMarketingHost()}`;
  }

  const host = effectiveRequestHost(req) || "clawdeals.com";
  const proto = effectiveRequestProto(req);
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function isWorkersDevRequest(req: any): boolean {
  const host = effectiveRequestHost(req);
  return typeof host === "string" && host.includes(".workers.dev");
}

export function isAppHostRequest(req: any): boolean {
  if (isEdgeMarketingProxyRequest(req)) return false;
  const host = effectiveRequestHost(req);
  return typeof host === "string" && host.startsWith("app.");
}

export function isNonIndexableMarketingHostRequest(req: any): boolean {
  return isWorkersDevRequest(req) || isAppHostRequest(req);
}
