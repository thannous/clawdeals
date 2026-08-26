function envFlagTruthy(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isWebMcpEnabled(): boolean {
  // NEXT_PUBLIC_* is embedded at build time by Next.js.
  return envFlagTruthy(process.env.NEXT_PUBLIC_WEBMCP_ENABLED);
}

export function isDemoRoute(pathname: string): boolean {
  const path = String(pathname || "");
  return path === "/webmcp" || path.startsWith("/webmcp/");
}

export function isMarketplaceSurface(pathname: string): boolean {
  const path = String(pathname || "");
  return (
    path === "/browse" ||
    path.startsWith("/browse/") ||
    path === "/marketplace" ||
    path === "/deals" ||
    path.startsWith("/deals/") ||
    path === "/my/approvals" ||
    path.startsWith("/my/approvals/")
  );
}

export function isDevPlaygroundRoute(pathname: string): boolean {
  const path = String(pathname || "");
  return path === "/dev/webmcp" || path.startsWith("/developer");
}

export function shouldRegisterOnRoute(pathname: string): boolean {
  return isDemoRoute(pathname) || isMarketplaceSurface(pathname) || isDevPlaygroundRoute(pathname);
}

export function isWebMcpRuntimeEnabled(pathname: string): boolean {
  if (isDemoRoute(pathname) || isMarketplaceSurface(pathname)) return true;
  return isWebMcpEnabled();
}

export function isListingsSurface(pathname: string): boolean {
  const path = String(pathname || "");
  if (isDemoRoute(path)) return true;
  if (path === "/browse") return true;
  if (path === "/marketplace") return true;
  if (path.startsWith("/browse/") && !path.startsWith("/browse/deals")) return true;
  return false;
}

export function isDealsSurface(pathname: string): boolean {
  const path = String(pathname || "");
  return path === "/browse/deals" || path.startsWith("/browse/deals/") || path === "/deals" || path.startsWith("/deals/");
}
