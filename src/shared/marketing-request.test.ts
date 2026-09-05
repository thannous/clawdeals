import { describe, expect, it } from "vitest";
import { effectiveRequestHost, isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "./marketing-request";

function req(headers: Record<string, string>) {
  return { headers };
}

describe("effectiveRequestHost", () => {
  it("uses forwarded marketing host when edge proxy marker is present", () => {
    const host = effectiveRequestHost(
      req({
        host: "app.clawdeals.com",
        "x-edge-router-proxy": "marketing",
        "x-forwarded-host": "clawdeals.com"
      })
    );

    expect(host).toBe("clawdeals.com");
  });

  it("falls back to preferred marketing host when forwarded host is not a marketing domain", () => {
    const host = effectiveRequestHost(
      req({
        host: "app.clawdeals.com",
        "x-edge-router-proxy": "marketing",
        "x-forwarded-host": "app.clawdeals.com"
      })
    );

    expect(host).toBe("clawdeals.com");
  });

  it("uses forwarded host when request is not edge-marked", () => {
    const host = effectiveRequestHost(
      req({
        host: "app.clawdeals.com",
        "x-forwarded-host": "www.clawdeals.com"
      })
    );

    expect(host).toBe("www.clawdeals.com");
  });
});

describe("marketingBaseUrlFromRequest", () => {
  it("forces canonical marketing base url for app-host requests", () => {
    const baseUrl = marketingBaseUrlFromRequest(
      req({
        host: "app.clawdeals.com",
        "x-forwarded-host": "app.clawdeals.com",
        "x-forwarded-proto": "https"
      })
    );

    expect(baseUrl).toBe("https://clawdeals.com");
  });
});

describe("isNonIndexableMarketingHostRequest", () => {
  it("is true on app host requests", () => {
    const isNoindex = isNonIndexableMarketingHostRequest(
      req({
        host: "app.clawdeals.com",
        "x-forwarded-host": "app.clawdeals.com",
        "x-forwarded-proto": "https"
      })
    );

    expect(isNoindex).toBe(true);
  });
});

it.each(["sandbox.clawdeals.com", "staging.app.clawdeals.com"])("excludes %s even behind the marketing proxy", (host) => {
  expect(isNonIndexableMarketingHostRequest(req({ host }))).toBe(true);
  expect(isNonIndexableMarketingHostRequest(req({ host: "app.clawdeals.com", "x-forwarded-host": host, "x-edge-router-proxy": "marketing" }))).toBe(true);
});
it("keeps the production marketing host indexable", () => {
  expect(isNonIndexableMarketingHostRequest(req({ host: "app.clawdeals.com", "x-forwarded-host": "clawdeals.com", "x-edge-router-proxy": "marketing" }))).toBe(false);
});
