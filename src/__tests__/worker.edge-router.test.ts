import { afterEach, describe, expect, it, vi } from "vitest";
import edgeRouterWorker from "../../workers/edge-router";

describe("worker edge router", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("permanently redirects a non-canonical English marketing URL before proxying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await edgeRouterWorker.fetch(
      new Request("https://clawdeals.com/en/guides?topic=mcp"),
      {
        APP_ORIGIN: "https://app.clawdeals.com",
        MARKETING_ORIGIN: "https://clawdeals.vercel.app",
        MARKETING_HOST: "clawdeals.com"
      }
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://clawdeals.com/guides?topic=mcp");
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it("dispatches the fast-lane cron endpoints with bearer authentication", async () => {
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

    const targets = fetchSpy.mock.calls.map(([target]) => target.toString());
    expect(targets).toContain("https://app.clawdeals.com/api/internal/cron/watchlist-match-queue");
    expect(targets).toContain("https://app.clawdeals.com/api/internal/cron/watchlist-backfill-queue");
    expect(targets).toContain("https://app.clawdeals.com/api/internal/cron/notifications-dispatch");
    expect(targets).toContain("https://app.clawdeals.com/api/internal/cron/offers-expiration");
    expect(targets).toContain("https://app.clawdeals.com/api/internal/cron/trustscore-recalc-queue");

    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          authorization: "Bearer cron-secret",
          "user-agent": "clawdeals-cloudflare-cron/1.0"
        }
      });
    }
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "cron.dispatch_succeeded",
        path: "/api/internal/cron/watchlist-match-queue",
        status: 200
      })
    );
  });

  it("dispatches hourly and daily cron lanes to their own endpoint sets", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ processed: 0 }), { status: 200 })
    );
    const env = {
      APP_ORIGIN: "https://app.clawdeals.com",
      MARKETING_ORIGIN: "https://app.clawdeals.com",
      MARKETING_HOST: "clawdeals.com",
      CRON_SECRET: "cron-secret"
    };

    await edgeRouterWorker.scheduled({ cron: "17 * * * *", scheduledTime: 0 }, env);
    const hourlyTargets = fetchSpy.mock.calls.map(([target]) => target.toString());
    expect(hourlyTargets).toContain("https://app.clawdeals.com/api/internal/cron/deals-lifecycle");
    expect(hourlyTargets).toContain("https://app.clawdeals.com/api/internal/cron/transactions-auto-close");
    expect(hourlyTargets).toContain("https://app.clawdeals.com/api/internal/cron/risk-rules");
    expect(hourlyTargets).toContain("https://app.clawdeals.com/api/internal/cron/observability-alerts");

    fetchSpy.mockClear();
    await edgeRouterWorker.scheduled({ cron: "10 2 * * *", scheduledTime: 0 }, env);
    const dailyTargets = fetchSpy.mock.calls.map(([target]) => target.toString());
    expect(dailyTargets).toContain("https://app.clawdeals.com/api/internal/cron/watchlist-digest");
    expect(dailyTargets).toContain("https://app.clawdeals.com/api/internal/cron/audit-retention");
    expect(dailyTargets).toContain("https://app.clawdeals.com/api/internal/cron/reports-retention");
    expect(dailyTargets).toContain("https://app.clawdeals.com/api/internal/cron/idempotency-retention");
    expect(dailyTargets).toContain("https://app.clawdeals.com/api/internal/cron/partition-maintenance");
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

  it("reports failed cron invocations without logging a response body", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
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
    ).rejects.toThrow("Cron dispatch failed");

    for (const [logged] of logSpy.mock.calls) {
      expect(String(logged)).not.toContain("sensitive upstream error");
    }
  });
});
