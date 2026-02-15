import { describe, expect, it } from "vitest";
import { effectiveRequestHost } from "./marketing-request";

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
