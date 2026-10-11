import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./agents", () => ({
  createAgentWithOwnerLimit: vi.fn(), getAgentById: vi.fn(), getAgentIdByOwnerId: vi.fn(), getOwnerAgentLimit: () => 1
}));
vi.mock("./watchlists", () => ({ createWatchlist: vi.fn(), getWatchlistForOwner: vi.fn(), listWatchlists: vi.fn() }));
vi.mock("./watchlist-backfill-queue", () => ({ enqueueWatchlistBackfill: vi.fn() }));
vi.mock("./acquisition", () => ({ safeRecordAgentMilestone: vi.fn() }));
vi.mock("./listings", () => ({ listListings: vi.fn() }));

import { createAgentWithOwnerLimit, getAgentById, getAgentIdByOwnerId } from "./agents";
import { createWatchlist, getWatchlistForOwner } from "./watchlists";
import { listListings } from "./listings";
import { createOwnerBuyMission, listOwnerBuyMissionMatches } from "./owner-buy-missions";

const ownerId = "10000000-0000-4000-8000-000000000001";
const missionId = "20000000-0000-4000-8000-000000000001";
function body() {
  return { market_code: "FR", criteria: {
    query: "bike", geo: { lat: 48.85, lon: 2.35 }, distance_km: 25,
    mission: {
      kind: "BUY", version: 1, hard_budget_max: 100.50, preferred_price_max: 90.25, currency: "EUR", requirements: [],
      autonomous_actions: ["search"], contact_reveal: "manual_bilateral_approval",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(), location: { lat: 48.85, lon: 2.35, radius_km: 25 }
    }
  } };
}

describe("owner buy missions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue("agent-1");
    vi.mocked(getAgentById).mockResolvedValue({ id: "agent-1", owner_id: ownerId });
    vi.mocked(getWatchlistForOwner).mockResolvedValue({ ...body(), watchlist_id: missionId, active: true, currency: "EUR" });
    vi.mocked(createWatchlist).mockImplementation(async (input: any) => ({ ...input, criteria: input.criteria, watchlist_id: missionId, market_code: input.marketCode }));
    vi.mocked(listListings).mockResolvedValue({ items: [], nextCursor: null });
  });

  it("validates budget currency before provisioning a first owner agent", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue(null);
    const input = body();
    input.criteria.mission.currency = "GBP";
    await expect(createOwnerBuyMission({ ownerId, body: input })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(createAgentWithOwnerLimit).not.toHaveBeenCalled();
    expect(createWatchlist).not.toHaveBeenCalled();
  });

  it("reuses the agent won by a concurrent first mission without bypassing its suspension", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValueOnce(null).mockResolvedValueOnce("agent-1");
    vi.mocked(createAgentWithOwnerLimit).mockRejectedValue({ code: "OWNER_AGENT_LIMIT_REACHED" });
    vi.mocked(getAgentById).mockResolvedValue({ id: "agent-1", owner_id: ownerId, suspended_at: new Date().toISOString() });
    await expect(createOwnerBuyMission({ ownerId, body: body() })).rejects.toMatchObject({ status: 403, code: "AGENT_SUSPENDED" });
    expect(createWatchlist).not.toHaveBeenCalled();
  });

  it("applies decimal budgets to search without narrowing explicitly selected permissions", async () => {
    const input = body();
    input.criteria.mission.autonomous_actions.push("ask_question");
    const result = await createOwnerBuyMission({ ownerId, body: input });
    expect(result.criteria).toMatchObject({ price_max: 100.50, notification_mode: "in_app", mission: { hard_budget_max: 100.50, autonomous_actions: ["search", "ask_question"] } });
  });

  it("never returns cross-market, over-budget, stale or out-of-radius catalogue rows", async () => {
    const listing = { listing_id: "listing-1", title: "City bike", status: "LIVE", market_code: "FR", currency: "EUR", price_amount: 100, distance_m: 25_000 };
    vi.mocked(listListings).mockResolvedValue({ items: [
      listing,
      { ...listing, listing_id: "decimal", price_amount: 100.50 },
      { ...listing, listing_id: "cross-market", market_code: "ES" },
      { ...listing, listing_id: "cross-currency", currency: "GBP" },
      { ...listing, listing_id: "over-budget", price_amount: 101 },
      { ...listing, listing_id: "outside", distance_m: 25_001 },
      { ...listing, listing_id: "missing-geo", distance_m: null },
      { ...listing, listing_id: "irrelevant", title: "City table" },
      { ...listing, listing_id: "sold", status: "SOLD" }
    ], nextCursor: null });
    const result = await listOwnerBuyMissionMatches({ ownerId, missionId });
    expect(result.items.map((item) => item.listing_id)).toEqual(["listing-1", "decimal"]);
    expect(result.items[0]).not.toHaveProperty("seller_agent_id");
    expect(listListings).toHaveBeenCalledWith(expect.objectContaining({ includeHidden: false, q: "bike", priceMax: 101, geo: { lat: 48.85, lng: 2.35, distanceKm: 25 } }));
  });

  it("shows an expired mission without searching or activating new work", async () => {
    const row = { ...body(), watchlist_id: missionId, active: true };
    row.criteria.mission.expires_at = "2000-01-01T00:00:00Z";
    vi.mocked(getWatchlistForOwner).mockResolvedValue(row);
    expect(await listOwnerBuyMissionMatches({ ownerId, missionId })).toEqual({ items: [], next_cursor: null, status: "EXPIRED" });
    expect(listListings).not.toHaveBeenCalled();
  });

  it("preserves agent watchlist category and delivery constraints in owner results", async () => {
    const input = body();
    vi.mocked(getWatchlistForOwner).mockResolvedValue({
      ...input,
      watchlist_id: missionId,
      active: true,
      currency: "EUR",
      criteria: { ...input.criteria, tags: ["cycling"], delivery_method: "PICKUP" }
    });
    const listing = {
      listing_id: "pickup", title: "City bike", status: "LIVE", market_code: "FR", currency: "EUR",
      price_amount: 90, distance_m: 1_000, category: "cycling", delivery_method: "PICKUP"
    };
    vi.mocked(listListings).mockResolvedValue({ items: [
      listing,
      { ...listing, listing_id: "either-delivery", delivery_method: "BOTH" },
      { ...listing, listing_id: "wrong-category", category: "electronics" },
      { ...listing, listing_id: "shipping-only", delivery_method: "SHIPPING" },
      { ...listing, listing_id: "unknown-delivery", delivery_method: null }
    ], nextCursor: null });
    const result = await listOwnerBuyMissionMatches({ ownerId, missionId });
    expect(result.items.map((item) => item.listing_id)).toEqual(["pickup", "either-delivery"]);
  });
});
