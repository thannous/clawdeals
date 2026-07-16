import { afterEach, describe, expect, it, vi } from "vitest";

import { WATCHLIST_BACKFILL_MAX_MATCHES } from "../config/watchlists";
import { runWatchlistBackfillQueue } from "./watchlist-backfill-queue";

function createQueueDeleteChain(filters: Array<{ column: string; value: any }>) {
  const chain: any = {
    eq: vi.fn((column: string, value: any) => {
      filters.push({ column, value });
      return chain;
    }),
    then: vi.fn((resolve: any) => Promise.resolve(resolve({ error: null })))
  };
  return chain;
}

describe("runWatchlistBackfillQueue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upserts every backfill match in bounded batches before cleaning the queue", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const queueUpdatedAt = "2026-02-08T00:00:00.000Z";
    const deals = Array.from({ length: WATCHLIST_BACKFILL_MAX_MATCHES + 25 }, (_, index) => ({
      deal_id: `deal-${index}`,
      title: `Console bundle ${index}`,
      tags: [],
      price: 100,
      currency: "EUR",
      market_code: "FR",
      status: "ACTIVE",
      created_at: new Date(now.getTime() - index * 1000).toISOString()
    }));

    const queueDeleteFilters: Array<{ column: string; value: any }> = [];
    const queueDeleteChain = createQueueDeleteChain(queueDeleteFilters);
    const upsertedRows: any[] = [];

    let queueTable: any;
    queueTable = {
      select: vi.fn(() => queueTable),
      order: vi.fn(() => queueTable),
      limit: vi.fn(async () => ({
        data: [{ watchlist_id: "wl-1", updated_at: queueUpdatedAt }],
        error: null
      })),
      delete: vi.fn(() => queueDeleteChain)
    };

    let dealsTable: any;
    dealsTable = {
      select: vi.fn(() => dealsTable),
      in: vi.fn(() => dealsTable),
      order: vi.fn(() => dealsTable),
      limit: vi.fn(async (limit: number) => ({
        data: deals.slice(0, limit),
        error: null
      }))
    };

    let listingsTable: any;
    listingsTable = {
      select: vi.fn(() => listingsTable),
      eq: vi.fn(() => listingsTable),
      order: vi.fn(() => listingsTable),
      limit: vi.fn(async () => ({ data: [], error: null }))
    };

    let watchlistsTable: any;
    watchlistsTable = {
      select: vi.fn(() => watchlistsTable),
      eq: vi.fn(() => watchlistsTable),
      is: vi.fn(() => watchlistsTable),
      maybeSingle: vi.fn(async () => ({
        data: {
          watchlist_id: "wl-1",
          agent_id: "agent-1",
          active: true,
          market_code: "FR",
          currency: "EUR",
          query_text: "console",
          tags: [],
          price_max: null,
          geo_lat: null,
          geo_lon: null,
          distance_km: null,
          criteria: null,
          deleted_at: null
        },
        error: null
      }))
    };

    const matchesTable: any = {
      upsert: vi.fn((rows: any[]) => {
        upsertedRows.push(...rows);
        return {
          select: vi.fn(async () => ({
            data: rows.map((_, index) => ({ watchlist_match_id: `match-${index}` })),
            error: null
          }))
        };
      })
    };

    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "watchlist_backfill_queue") return queueTable;
        if (table === "deals") return dealsTable;
        if (table === "listings") return listingsTable;
        if (table === "watchlists") return watchlistsTable;
        if (table === "watchlist_matches") return matchesTable;
        throw new Error(`Unexpected table ${table}`);
      })
    };

    const result = await runWatchlistBackfillQueue({
      client,
      now,
      limit: 1,
      dealsLimit: WATCHLIST_BACKFILL_MAX_MATCHES + 25,
      listingsLimit: 1
    });

    expect(result).toMatchObject({
      ok: true,
      processed_count: 1,
      inserted_count: WATCHLIST_BACKFILL_MAX_MATCHES + 25
    });
    expect(upsertedRows).toHaveLength(WATCHLIST_BACKFILL_MAX_MATCHES + 25);
    expect(matchesTable.upsert).toHaveBeenCalledTimes(2);
    expect(vi.mocked(matchesTable.upsert).mock.calls[0][0]).toHaveLength(WATCHLIST_BACKFILL_MAX_MATCHES);
    expect(vi.mocked(matchesTable.upsert).mock.calls[1][0]).toHaveLength(25);
    expect(matchesTable.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          watchlist_id: "wl-1",
          agent_id: "agent-1",
          entity_type: "deal",
          entity_id: "deal-0"
        })
      ]),
      {
        onConflict: "watchlist_id,entity_type,entity_id",
        ignoreDuplicates: true
      }
    );
    expect(queueTable.delete).toHaveBeenCalledTimes(1);
    expect(queueDeleteFilters).toEqual([
      { column: "watchlist_id", value: "wl-1" },
      { column: "updated_at", value: queueUpdatedAt }
    ]);
  });
});
