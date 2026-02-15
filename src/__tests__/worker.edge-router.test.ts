import { afterEach, describe, expect, it, vi } from "vitest";
import edgeRouterWorker from "../../workers/edge-router";

describe("worker edge router", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves marketing robots.txt directly without upstream fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = new Request("https://clawdeals.com/robots.txt");

    const response = await edgeRouterWorker.fetch(request, {
      APP_ORIGIN: "https://app.clawdeals.com",
      MARKETING_ORIGIN: "https://app.clawdeals.com",
      MARKETING_HOST: "clawdeals.com"
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap: https://clawdeals.com/sitemap.xml");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
