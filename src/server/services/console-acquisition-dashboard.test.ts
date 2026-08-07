import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

import { getConsoleAcquisitionDashboard } from "./console-acquisition-dashboard";

function makeClient({ summaryRows, ctaRows }: { summaryRows: any[]; ctaRows: any[] }) {
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
        agent_connected_at: "2026-07-20T10:10:00.000Z",
        watchlist_created_at: "2026-07-20T10:15:00.000Z",
        first_match_at: "2026-07-21T08:00:00.000Z",
        d7_retained_at: "2026-07-27T10:00:00.000Z",
        market_code: "FR",
        source: "google",
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
        locale: "en"
      },
      {
        acquisition_id: "old",
        landing_view_at: "2026-01-01T00:00:00.000Z",
        market_code: "FR",
        source: "google"
      }
    ];
    const ctaRows = [{ cta_location: "hero" }, { cta_location: "hero" }, { cta_location: null }];

    const client = makeClient({ summaryRows, ctaRows });
    const result = await getConsoleAcquisitionDashboard({ windowDays: 30, now, client });

    expect(result.sample.acquisitions).toBe(2);
    const bySteps = Object.fromEntries(result.funnel.map((row) => [row.step, row]));
    expect(bySteps.landing_view.count).toBe(2);
    expect(bySteps.connect_cta_clicked.count).toBe(1);
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
      { cta_location: "hero", clicks: 2 },
      { cta_location: "other", clicks: 1 }
    ]);
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
    expect(result.by_cta).toEqual([]);
  });
});
