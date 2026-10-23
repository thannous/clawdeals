import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/services/watchlists", () => ({ getWatchlistForOwner: vi.fn(), listWatchlists: vi.fn() }));
vi.mock("../../server/services/listings", () => ({ listListings: vi.fn() }));
vi.mock("../../server/services/smartphone-mission-matching", async importOriginal => ({
  ...await importOriginal<typeof import("../../server/services/smartphone-mission-matching")>(),
  loadSmartphoneMissionSnapshots: vi.fn(), getSmartphoneMissionAlerts: vi.fn(),
}));

import { getWatchlistForOwner } from "../../server/services/watchlists";
import { listListings } from "../../server/services/listings";
import { getSmartphoneMissionAlerts, loadSmartphoneMissionSnapshots } from "../../server/services/smartphone-mission-matching";
import { listOwnerBuyMissionMatches } from "../../server/services/owner-buy-missions";

// Sequential E2E cannot place an edit between the catalogue read and the final
// response barrier. Keep the evaluator real and control only the I/O snapshots.
describe("owner mission results during a market edit", () => {
  const listing = { listing_id: "phone", title: "iPhone 13", category: "smartphones", status: "LIVE", market_code: "FR", currency: "EUR", price_amount: 400, geo_lat: 48.85, geo_lng: 2.35, distance_m: 0 };
  const row = () => ({
    watchlist_id: "mission", agent_id: "agent", active: true, market_code: "FR", currency: "EUR", updated_at: "2026-10-23T14:00:00.000001Z",
    criteria: { query: "iPhone", price_max: 500, geo: { lat: 48.85, lon: 2.35 }, distance_km: 10,
      mission: { kind: "BUY", hard_budget_max: 500, currency: "EUR", expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        location: { lat: 48.85, lon: 2.35, radius_km: 10 },
        smartphone: { version: 1, model: "iPhone 13", battery_health_min: null, required_checks: [] } } },
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listListings).mockResolvedValue({ items: [listing], nextCursor: null } as any);
    vi.mocked(loadSmartphoneMissionSnapshots).mockResolvedValue(new Map([["phone", {
      listing, passport: { model: "iPhone 13", battery_health_percent: 95, checks: [] }, revision: 1, visible: true,
    }]]));
    vi.mocked(getSmartphoneMissionAlerts).mockResolvedValue([{ listing_id: "phone", matched_at: "2026-10-23T14:00:00Z", reason: {}, listing }] as any);
  });
  it.each([
    { market_code: "ES" },
    { currency: "GBP" },
    // FR -> ES -> FR can leave the same criteria/market with a new generation.
    { updated_at: "2026-10-23T14:00:00.000002Z" },
  ])("discards the whole old page after an edit %j", async patch => {
    const initial = row();
    vi.mocked(getWatchlistForOwner).mockResolvedValueOnce(initial).mockResolvedValueOnce({ ...initial, ...patch });
    expect(await listOwnerBuyMissionMatches({ ownerId: "owner", missionId: "mission" }))
      .toEqual({ items: [], alerts: [], next_cursor: null, status: "ACTIVE" });
  });
  it("keeps compatible items and alerts when the mission generation is unchanged", async () => {
    vi.mocked(getWatchlistForOwner).mockResolvedValue(row());
    const result = await listOwnerBuyMissionMatches({ ownerId: "owner", missionId: "mission" });
    expect(result.items.map(item => item.listing_id)).toEqual(["phone"]);
    expect(result.alerts?.map(alert => alert.listing_id)).toEqual(["phone"]);
  });
});
