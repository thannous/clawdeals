function envFlagTruthy(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isWebMcpEnabled(): boolean {
  // NEXT_PUBLIC_* is embedded at build time by Next.js.
  return envFlagTruthy(process.env.NEXT_PUBLIC_WEBMCP_ENABLED);
}

export function shouldRegisterOnRoute(pathname: string): boolean {
  const path = String(pathname || "");
  return path === "/dev/webmcp" || path.startsWith("/developer");
}

