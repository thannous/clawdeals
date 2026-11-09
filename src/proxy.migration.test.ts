import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());
describe("explicit migration maintenance", () => {
  it.each(["/api/v1/listings", "/api/v1/cron/queues", "/api/auth/get-session", "/settings/identities", "/fr"]) ("freezes dynamic request %s", async path => {
    vi.stubEnv("CLAWDEALS_MIGRATION_FREEZE", "true");
    expect(doesProxyMatch({ config, nextConfig: {}, url: path })).toBe(true);
    const response = proxy(new NextRequest(`https://app.clawdeals.com${path}`, { method: "POST", headers: { "x-edge-router-proxy": "marketing", "next-router-prefetch": "1" } }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("MIGRATION_MAINTENANCE");
  });
  it("does not exempt unknown nonempty flag values", () => {
    vi.stubEnv("CLAWDEALS_MIGRATION_FREEZE", "unexpected");
    expect(proxy(new NextRequest("https://app.clawdeals.com/api/v1/listings")).status).toBe(503);
  });
  it.each(["", "false", "0"]) ("resumes only with an explicit disabled value %s", value => {
    vi.stubEnv("CLAWDEALS_MIGRATION_FREEZE", value);
    expect(proxy(new NextRequest("https://app.clawdeals.com/api/v1/listings")).headers.get("x-middleware-next")).toBe("1");
  });
  it("keeps static assets out of the dynamic matcher", () => {
    for (const url of ["/_next/static/chunk.js", "/_next/image?url=a", "/favicon.ico"]) {
      expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(false);
    }
  });
});
