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

  it("dispatches the watchlist queue cron with bearer authentication", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ processed: 0 }), { status: 200 })
    );

    await edgeRouterWorker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: 0 },
      {
        APP_ORIGIN: "https://app.clawdeals.com",
        MARKETING_ORIGIN: "https://app.clawdeals.com",
        MARKETING_HOST: "clawdeals.com",
        CRON_SECRET: "cron-secret"
      }
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [target, init] = fetchSpy.mock.calls[0];
    expect(target.toString()).toBe(
      "https://app.clawdeals.com/api/internal/cron/watchlist-match-queue"
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer cron-secret",
        "user-agent": "clawdeals-cloudflare-cron/1.0"
      }
    });
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: "watchlist.match_queue_cron_succeeded", status: 200 })
    );
  });

  it("fails closed when the Cloudflare cron secret is missing", async () => {
    await expect(
      edgeRouterWorker.scheduled(
        { cron: "*/5 * * * *", scheduledTime: 0 },
        {
          APP_ORIGIN: "https://app.clawdeals.com",
          MARKETING_ORIGIN: "https://app.clawdeals.com",
          MARKETING_HOST: "clawdeals.com"
        }
      )
    ).rejects.toThrow("Missing CRON_SECRET");
  });

  it("reports a failed watchlist queue invocation without logging a response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sensitive upstream error", { status: 500 })
    );

    await expect(
      edgeRouterWorker.scheduled(
        { cron: "*/5 * * * *", scheduledTime: 0 },
        {
          APP_ORIGIN: "https://app.clawdeals.com",
          MARKETING_ORIGIN: "https://app.clawdeals.com",
          MARKETING_HOST: "clawdeals.com",
          CRON_SECRET: "cron-secret"
        }
      )
    ).rejects.toThrow("status 500");
  });
});
