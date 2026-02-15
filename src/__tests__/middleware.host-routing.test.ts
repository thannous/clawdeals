import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

function makeReq(url: string, host?: string) {
  return new NextRequest(url, {
    headers: host ? { host } : undefined
  });
}

function makeReqWithHeaders(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("middleware host routing", () => {
  it("redirects app host / to /start by default", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/", "app.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });

  it("redirects app host / to /fr/start when browser language is fr", () => {
    const res = middleware(
      makeReqWithHeaders("https://app.clawdeals.com/", {
        host: "app.clawdeals.com",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8"
      })
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/fr/start");
  });

  it("prioritizes NEXT_LOCALE cookie over accept-language on app host /", () => {
    const res = middleware(
      makeReqWithHeaders("https://app.clawdeals.com/", {
        host: "app.clawdeals.com",
        cookie: "NEXT_LOCALE=en",
        "accept-language": "fr-FR,fr;q=0.9"
      })
    );
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

  it("bounces marketing /settings/connected-apps to app host", () => {
    const res = middleware(
      makeReq("https://www.clawdeals.com/settings/connected-apps", "www.clawdeals.com")
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/settings/connected-apps");
  });

  it("keeps marketing / as-is", () => {
    const res = middleware(makeReq("https://clawdeals.com/", "clawdeals.com"));
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("canonicalizes www marketing host to apex on non-app routes", () => {
    const res = middleware(makeReq("https://www.clawdeals.com/", "www.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://clawdeals.com/");
  });

  it("bounces non-app route on app host back to marketing", () => {
    const res = middleware(makeReq("https://app.clawdeals.com/pricing", "app.clawdeals.com"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://clawdeals.com/pricing");
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

  it("does not redirect app host /settings/connected-apps", () => {
    const res = middleware(
      makeReq("https://app.clawdeals.com/settings/connected-apps", "app.clawdeals.com")
    );
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("bounces .vercel.app to custom domain", () => {
    const res = middleware(makeReq("https://clawdeals-git-main-foo.vercel.app/start", "clawdeals-git-main-foo.vercel.app"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });

  it("does not redirect marketing pages proxied from apex to .vercel.app", () => {
    const res = middleware(
      makeReqWithHeaders("https://clawdeals-git-main-foo.vercel.app/trust-engine", {
        host: "clawdeals-git-main-foo.vercel.app",
        "x-forwarded-host": "clawdeals.com",
        "x-edge-router-proxy": "marketing"
      })
    );
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps redirect for app sections on .vercel.app even with edge proxy headers", () => {
    const res = middleware(
      makeReqWithHeaders("https://clawdeals-git-main-foo.vercel.app/start", {
        host: "clawdeals-git-main-foo.vercel.app",
        "x-forwarded-host": "clawdeals.com",
        "x-edge-router-proxy": "marketing"
      })
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.clawdeals.com/start");
  });

  it("serves non-app routes on app host when proxied from marketing host", () => {
    const res = middleware(
      makeReqWithHeaders("https://app.clawdeals.com/trust-engine", {
        host: "app.clawdeals.com",
        "x-forwarded-host": "clawdeals.com",
        "x-edge-router-proxy": "marketing"
      })
    );
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("serves / on app host when proxied from marketing host", () => {
    const res = middleware(
      makeReqWithHeaders("https://app.clawdeals.com/", {
        host: "app.clawdeals.com",
        "x-forwarded-host": "clawdeals.com",
        "x-edge-router-proxy": "marketing"
      })
    );
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });
});
