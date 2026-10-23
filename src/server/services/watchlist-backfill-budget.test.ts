import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWatchlistBackfillQueue } from "./watchlist-backfill-queue";
import { loadSmartphoneMissionSnapshots, recordSmartphoneMissionMatch } from "./smartphone-mission-matching";

vi.mock("./smartphone-mission-matching", () => ({
  loadSmartphoneMissionSnapshots: vi.fn(), recordSmartphoneMissionMatch: vi.fn()
}));
vi.mock("./acquisition", () => ({ safeRecordAgentMilestone: vi.fn() }));

// The connected test exercises a small requested limit. This isolates the server
// hard cap, a failure exactly between transitions, and a lease-losing worker.
function harness(missionCount = 1, listingCount = 5) {
  const queues = new Map(Array.from({ length: missionCount }, (_, i) => [`mission-${i}`, {
    watchlist_id: `mission-${i}`, updated_at: "2026-10-22T00:00:00.123456Z", progress_version: 0,
    scan_started_at: null as string | null, scan_limit: null as number | null,
    listing_cursor_created_at: null as string | null, listing_cursor_id: null as string | null, listings_scanned: 0
  }]));
  const listings = Array.from({ length: listingCount }, (_, i) => ({ listing_id: `listing-${i}`, created_at: `2026-10-${String(20-i).padStart(2, "0")}T00:00:00.654321Z` }));
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let maximum = 200;
      let cursor = "";
      const query: any = {
        select: () => query, order: () => query, is: () => query, lte: () => query,
        abortSignal: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        limit: (value: number) => { maximum = value; return query; },
        or: (value: string) => { cursor = value; return query; },
        maybeSingle: () => query,
        then(resolve: any, reject: any) {
          let data: any;
          if (table === "watchlist_backfill_queue") data = [...queues.values()].map(row => ({ ...row })).slice(0, maximum);
          else if (table === "watchlists") data = { watchlist_id: filters.watchlist_id, active: true, market_code: "FR", criteria: { mission: { smartphone: {} } } };
          else if (table === "listings") {
            expect(filters.market_code).toBe("FR");
            const after = cursor ? listings.findIndex(row => cursor.includes(`listing_id.lt.${row.listing_id}`)) + 1 : 0;
            data = listings.slice(after, after + maximum);
          } else throw new Error(`Unexpected table ${table}`);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    rpc(_name: string, args: any) {
      const row = queues.get(args.p_watchlist_id);
      const matched = !!row && row.updated_at === args.p_generation && row.progress_version === args.p_progress_version;
      if (matched && args.p_complete) queues.delete(args.p_watchlist_id);
      else if (matched && row) Object.assign(row, {
        scan_started_at: args.p_scan_started_at, scan_limit: args.p_scan_limit,
        listing_cursor_created_at: args.p_cursor_created_at, listing_cursor_id: args.p_cursor_id,
        listings_scanned: args.p_listings_scanned, progress_version: row.progress_version + 1
      });
      return { abortSignal: () => Promise.resolve({ data: matched, error: null }) };
    }
  };
  vi.mocked(loadSmartphoneMissionSnapshots).mockImplementation(async ids => new Map(ids.map(id => [id, { listing: { listing_id: id }, passport: null, revision: 0, visible: true }])));
  return { client, queues, listings };
}

describe("bounded smartphone backfill orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordSmartphoneMissionMatch).mockResolvedValue({ matched: false, alert: null });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it("caps all missions together at 20 transitions even when the caller requests 10000", async () => {
    const { client, queues } = harness(20, 2);
    const result = await runWatchlistBackfillQueue({ client, limit: 20, transitionLimit: 10_000, listingsLimit: 2 });
    expect(result).toMatchObject({ transition_count: 20, completed_count: 10, deferred_count: 10 });
    expect(recordSmartphoneMissionMatch).toHaveBeenCalledTimes(20);
    expect(queues.size).toBe(10);
  });
  it("resumes after the last committed transition when the next RPC fails", async () => {
    const { client, queues } = harness();
    vi.mocked(recordSmartphoneMissionMatch).mockResolvedValueOnce({ matched: false, alert: null })
      .mockResolvedValueOnce({ matched: false, alert: null }).mockRejectedValueOnce(new Error("timeout"));
    const first = await runWatchlistBackfillQueue({ client });
    expect(first).toMatchObject({ transition_count: 3, failed_count: 1 });
    expect(queues.get("mission-0")).toMatchObject({ listings_scanned: 2, listing_cursor_id: "listing-1" });
    vi.mocked(recordSmartphoneMissionMatch).mockClear();
    const second = await runWatchlistBackfillQueue({ client });
    expect(second).toMatchObject({ transition_count: 3, completed_count: 1 });
    expect(vi.mocked(recordSmartphoneMissionMatch).mock.calls.map(([arg]) => arg.snapshot.listing.listing_id)).toEqual(["listing-2", "listing-3", "listing-4"]);
    expect(queues.size).toBe(0);
  });
  it("stops a stale worker after a concurrent enqueue without consuming the new generation", async () => {
    const { client, queues } = harness();
    vi.mocked(recordSmartphoneMissionMatch).mockImplementationOnce(async () => {
      Object.assign(queues.get("mission-0")!, { updated_at: "2026-10-23T00:00:00.123457Z", progress_version: 0, scan_started_at: null, scan_limit: null });
      return { matched: false, alert: null };
    });
    expect(await runWatchlistBackfillQueue({ client })).toMatchObject({ transition_count: 1, completed_count: 0 });
    expect(recordSmartphoneMissionMatch).toHaveBeenCalledTimes(1);
    expect(queues.get("mission-0")).toMatchObject({ listings_scanned: 0, progress_version: 0, listing_cursor_id: null });
  });
  it("checkpoints the current transition before stopping for the global time reserve", async () => {
    const { client, queues } = harness();
    const time = vi.spyOn(Date, "now").mockReturnValue(0);
    vi.mocked(recordSmartphoneMissionMatch).mockImplementationOnce(async () => {
      time.mockReturnValue(21_000);
      return { matched: false, alert: null };
    });
    expect(await runWatchlistBackfillQueue({ client })).toMatchObject({ transition_count: 1, completed_count: 0 });
    expect(queues.get("mission-0")).toMatchObject({ listings_scanned: 1, listing_cursor_id: "listing-0" });
  });
});
