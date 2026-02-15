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

function preferredMarketingHost(): string {
  const configured = String(process.env.MARKETING_HOSTS || "clawdeals.com,www.clawdeals.com")
    .split(",")
    .map((h) => normalizeHost(h))
    .filter(Boolean);
  if (configured.includes("clawdeals.com")) return "clawdeals.com";
  return configured[0] || "clawdeals.com";
}

export function isEdgeMarketingProxyRequest(req: any): boolean {
  const marker = readHeader(req, "x-edge-router-proxy").trim().toLowerCase();
  return marker === "marketing" || marker === "1";
}

export function effectiveRequestHost(req: any): string {
  if (isEdgeMarketingProxyRequest(req)) return preferredMarketingHost();
  return normalizeHost(readHeader(req, "x-forwarded-host") || readHeader(req, "host"));
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
  // For proxied marketing requests, always force the canonical marketing host.
  if (!isEdgeMarketingProxyRequest(req)) {
    const configured = process.env.SITE_URL;
    if (configured && typeof configured === "string" && configured.startsWith("http")) {
      return configured.replace(/\/$/, "");
    }
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
