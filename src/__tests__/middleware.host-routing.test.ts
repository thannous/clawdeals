import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

function makeReq(url: string, host?: string) {
  return new NextRequest(url, {
    headers: host ? { host } : undefined
  });
}

describe("middleware host routing", () => {
  it("redirects app host / to /start by default", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/", "app.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });

  it("preserves locale prefix for app host /fr", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/fr", "app.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/fr/start");
  });

  it("bounces marketing /start to app host", () => {
    const res = middleware(makeReq("https://www.clawdeals.com/start", "www.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });

  it("bounces marketing /claim/:token to app host", () => {
    const res = middleware(makeReq("https://www.clawdeals.com/claim/cd_claim_123", "www.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/claim/cd_claim_123");
  });

  it("bounces marketing /device to app host", () => {
    const res = middleware(makeReq("https://www.clawdeals.com/device", "www.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/device");
  });

  it("keeps marketing / as-is", () => {
    const res = middleware(makeReq("https://www.clawdeals.com/", "www.clawdeals.com"));
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("bounces non-app route on app host back to marketing", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/pricing", "app.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://www.clawdeals.com/pricing");
  });

  it("does not redirect static assets on app host", () => {
    const manifest = middleware(makeReq("https://app.clawdeals.com/site.webmanifest", "app.clawdeals.com"));
    expect(manifest?.headers.get("x-middleware-next")).toBe("1");

    const icon = middleware(makeReq("https://app.clawdeals.com/favicon.svg", "app.clawdeals.com"));
    expect(icon?.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect app host /claim/:token", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/claim/cd_claim_123", "app.clawdeals.com"));
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect app host /device", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/device", "app.clawdeals.com"));
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("bounces .vercel.app to custom domain", () => {
    const res = middleware(makeReq("https://clawdeals-git-main-foo.vercel.app/start", "clawdeals-git-main-foo.vercel.app"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });
});
