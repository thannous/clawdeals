import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

import { getConsoleAcquisitionDashboard } from "./console-acquisition-dashboard";

function makeClient({
  summaryRows,
  ctaRows,
  revenueRows = []
}: {
  summaryRows: any[];
  ctaRows: any[];
  revenueRows?: any[];
}) {
  return {
    from(table: string) {
      if (table === "acquisition_funnel_summary") {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ data: summaryRows, error: null });
              }
            };
          }
        };
      }
      if (table === "acquisition_funnel_events") {
        return {
          select() {
            const chain: any = {
              eq() {
                return chain;
              },
              gte() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: ctaRows, error: null });
              }
            };
            return chain;
          }
        };
      }
      if (table === "acquisition_revenue_attribution_summary") {
        return {
          select() {
            const chain: any = {
              gte() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: revenueRows, error: null });
              }
            };
            return chain;
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

describe("getConsoleAcquisitionDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates funnel counts, markets, sources, and CTA locations inside the window", async () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const summaryRows = [
      {
        acquisition_id: "a1",
        landing_view_at: "2026-07-20T10:00:00.000Z",
        organic_entry_at: "2026-07-20T10:00:00.000Z",
        connect_cta_clicked_at: "2026-07-20T10:05:00.000Z",
        activation_started_at: "2026-07-20T10:07:00.000Z",
        agent_connected_at: "2026-07-20T10:10:00.000Z",
        watchlist_created_at: "2026-07-20T10:15:00.000Z",
        first_match_at: "2026-07-21T08:00:00.000Z",
        d7_retained_at: "2026-07-27T10:00:00.000Z",
        market_code: "FR",
        source: "google",
        medium: "organic",
        channel: "organic_search",
        locale: "fr"
      },
      {
        acquisition_id: "a2",
        landing_view_at: "2026-07-25T09:00:00.000Z",
        organic_entry_at: null,
        connect_cta_clicked_at: null,
        agent_connected_at: null,
        watchlist_created_at: null,
        first_match_at: null,
        d7_retained_at: null,
        market_code: "GB",
        source: null,
        medium: "none",
        channel: "direct",
        locale: "en"
      },
      {
        acquisition_id: "old",
        landing_view_at: "2026-01-01T00:00:00.000Z",
        market_code: "FR",
        source: "google"
      }
    ];
    const ctaRows = [
      { cta_location: "hero", interaction_type: "primary_click" },
      { cta_location: "hero", interaction_type: "auxclick" },
      { cta_location: null, interaction_type: null }
    ];
    const revenueRows = [
      {
        escrow_id: "e1",
        acquisition_id: "a1",
        currency: "EUR",
        gross_volume_minor: "10000",
        platform_revenue_minor: "400",
        source: "google",
        medium: "organic",
        channel: "organic_search"
      },
      {
        escrow_id: "e2",
        acquisition_id: null,
        currency: "EUR",
        gross_volume_minor: 2500,
        platform_revenue_minor: 100,
        source: null,
        medium: null,
        channel: null
      },
      {
        escrow_id: "e3",
        acquisition_id: "a1",
        currency: "GBP",
        gross_volume_minor: 5000,
        platform_revenue_minor: 200,
        source: "google",
        medium: "organic",
        channel: "organic_search"
      }
    ];

    const client = makeClient({ summaryRows, ctaRows, revenueRows });
    const result = await getConsoleAcquisitionDashboard({ windowDays: 30, now, client });

    expect(result.sample.acquisitions).toBe(2);
    const bySteps = Object.fromEntries(result.funnel.map((row) => [row.step, row]));
    expect(bySteps.landing_view.count).toBe(2);
    expect(bySteps.connect_cta_clicked.count).toBe(1);
    expect(bySteps.activation_started.count).toBe(1);
    expect(bySteps.d7_retained.count).toBe(1);
    expect(bySteps.landing_view.pct_of_landing).toBe(100);
    expect(bySteps.d7_retained.pct_of_landing).toBe(50);

    expect(result.by_market.map((m) => m.market_code)).toEqual(["FR", "GB"]);
    expect(result.by_market[0].agent_connected).toBe(1);
    expect(result.by_market[1].agent_connected).toBe(0);

    expect(result.by_source).toEqual([
      { source: "google", landing_views: 1 },
      { source: "(direct)", landing_views: 1 }
    ]);

    expect(result.by_cta).toEqual([
      { cta_location: "hero", interaction_type: "primary_click", clicks: 1 },
      { cta_location: "hero", interaction_type: "auxclick", clicks: 1 },
      { cta_location: "other", interaction_type: "unknown", clicks: 1 }
    ]);

    expect(result.by_channel).toEqual([
      {
        channel: "organic_search",
        source: "google",
        medium: "organic",
        landing_views: 1,
        agent_connected: 1,
        first_match: 1
      },
      {
        channel: "direct",
        source: "(direct)",
        medium: "none",
        landing_views: 1,
        agent_connected: 0,
        first_match: 0
      }
    ]);

    expect(result.attribution.id).toBe("buyer_last_touch_v1");
    expect(result.revenue.sample).toMatchObject({
      released_escrows: 3,
      attributed_released_escrows: 2,
      unattributed_released_escrows: 1
    });
    expect(result.revenue.by_currency).toEqual([
      {
        currency: "EUR",
        released_escrows: 2,
        attributed_released_escrows: 1,
        gross_volume_minor: "12500",
        platform_revenue_minor: "500"
      },
      {
        currency: "GBP",
        released_escrows: 1,
        attributed_released_escrows: 1,
        gross_volume_minor: "5000",
        platform_revenue_minor: "200"
      }
    ]);
    expect(result.reconciliation.backend_revenue).toEqual({
      released_escrows: 3,
      attributed_released_escrows: 2,
      unattributed_released_escrows: 1
    });
  });

  it("reports zero counts and null percentages when there is no traffic", async () => {
    const client = makeClient({ summaryRows: [], ctaRows: [] });
    const result = await getConsoleAcquisitionDashboard({
      windowDays: 7,
      now: new Date("2026-08-01T00:00:00.000Z"),
      client
    });

    expect(result.sample.acquisitions).toBe(0);
    expect(result.funnel.every((row) => row.count === 0 && row.pct_of_landing === null)).toBe(true);
    expect(result.by_market).toEqual([]);
    expect(result.by_source).toEqual([]);
    expect(result.by_channel).toEqual([]);
    expect(result.by_cta).toEqual([]);
    expect(result.revenue.sample.released_escrows).toBe(0);
    expect(result.revenue.by_currency).toEqual([]);
  });
});
