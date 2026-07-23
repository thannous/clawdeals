import { afterEach, describe, expect, it, vi } from "vitest";

import { runWatchlistMatchQueue } from "./watchlist-match-queue";

type QueueRow = {
  entity_type: "deal" | "listing";
  entity_id: string;
  updated_at: string | null;
  attempt_count?: number | null;
  last_error?: string | null;
  last_reason?: string | null;
};

class FakeSupabaseClient {
  queue: QueueRow[];
  deals: any[];
  listings: any[];

  constructor({ queue = [], deals = [], listings = [] }: { queue?: QueueRow[]; deals?: any[]; listings?: any[] }) {
    this.queue = queue;
    this.deals = deals;
    this.listings = listings;
  }

  upsertQueueRow(next: QueueRow) {
    const index = this.queue.findIndex((row) => row.entity_type === next.entity_type && row.entity_id === next.entity_id);
    if (index >= 0) {
      this.queue[index] = { ...this.queue[index], ...next };
    } else {
      this.queue.push(next);
    }
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  client: FakeSupabaseClient;
  table: string;
  op: "select" | "delete" | "update" | null = null;
  patch: any = null;
  filters: Array<{ column: string; value: any }> = [];
  inFilters: Array<{ column: string; values: any[] }> = [];
  limitValue: number | null = null;

  constructor(client: FakeSupabaseClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select(_columns: string) {
    this.op = "select";
    return this;
  }

  order(_column: string, _opts?: any) {
    return this;
  }

  limit(limit: number) {
    this.limitValue = limit;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  update(patch: any) {
    this.op = "update";
    this.patch = patch;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.inFilters.push({ column, values });
    return this;
  }

  maybeSingle() {
    return this.executeMaybeSingle();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private tableRows() {
    if (this.table === "watchlist_match_queue") return this.client.queue;
    if (this.table === "deals") return this.client.deals;
    if (this.table === "listings") return this.client.listings;
    throw new Error(`Unexpected table: ${this.table}`);
  }

  private matches(row: any) {
    return (
      this.filters.every((filter) => row?.[filter.column] === filter.value) &&
      this.inFilters.every((filter) => filter.values.includes(row?.[filter.column]))
    );
  }

  private async executeMaybeSingle() {
    const row = this.tableRows().find((candidate) => this.matches(candidate)) || null;
    return { data: row ? { ...row } : null, error: null };
  }

  private async execute() {
    if (this.table !== "watchlist_match_queue") {
      return { data: null, error: new Error(`Unexpected operation on table: ${this.table}`) };
    }

    if (this.op === "select") {
      const sorted = [...this.client.queue].sort((a, b) => {
        const ua = a.updated_at || "";
        const ub = b.updated_at || "";
        if (ua < ub) return -1;
        if (ua > ub) return 1;
        if (a.entity_type !== b.entity_type) return a.entity_type < b.entity_type ? -1 : 1;
        return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
      });
      const limited = typeof this.limitValue === "number" ? sorted.slice(0, this.limitValue) : sorted;
      return { data: limited.map((row) => ({ ...row })), error: null };
    }

    if (this.op === "delete") {
      this.client.queue = this.client.queue.filter((row) => !this.matches(row));
      return { data: null, error: null };
    }

    if (this.op === "update") {
      this.client.queue = this.client.queue.map((row) => (this.matches(row) ? { ...row, ...this.patch } : row));
      return { data: null, error: null };
    }

    return { data: null, error: new Error("No operation specified") };
  }
}

describe("runWatchlistMatchQueue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not delete a row that was re-enqueued while a deal was matching", async () => {
    const t1 = "2026-02-08T00:00:00.000Z";
    const t2 = "2026-02-08T00:00:10.000Z";
    const dealId = "11111111-1111-4111-8111-111111111111";
    const client = new FakeSupabaseClient({
      queue: [{ entity_type: "deal", entity_id: dealId, updated_at: t1, attempt_count: 0, last_reason: "deal_insert" }],
      deals: [{ deal_id: dealId, title: "Console", tags: ["gaming"], price: 199, currency: "EUR", status: "NEW" }]
    });

    const matchDeal = vi.fn(async ({ deal }: { deal: any }) => {
      client.upsertQueueRow({
        entity_type: "deal",
        entity_id: deal.deal_id,
        updated_at: t2,
        attempt_count: 0,
        last_reason: "deal_insert"
      });
      return { ok: true, matched_count: 2, inserted_count: 1 };
    });

    const summary = await runWatchlistMatchQueue({
      client,
      matchDeal,
      limit: 10,
      now: new Date("2026-02-08T00:00:20.000Z")
    });

    expect(summary).toMatchObject({
      ok: true,
      scanned_count: 1,
      processed_count: 1,
      success_count: 1,
      error_count: 0,
      matched_count: 2,
      inserted_count: 1
    });
    expect(matchDeal).toHaveBeenCalledWith({
      deal: expect.objectContaining({ deal_id: dealId }),
      now: new Date("2026-02-08T00:00:20.000Z"),
      client
    });
    expect(client.queue).toHaveLength(1);
    expect(client.queue[0].updated_at).toBe(t2);
  });

  it("increments attempts and keeps the row when matching fails", async () => {
    const t1 = "2026-02-08T00:00:00.000Z";
    const now = new Date("2026-02-08T00:05:00.000Z");
    const listingId = "22222222-2222-4222-8222-222222222222";
    const client = new FakeSupabaseClient({
      queue: [{ entity_type: "listing", entity_id: listingId, updated_at: t1, attempt_count: 2 }],
      listings: [
        {
          listing_id: listingId,
          title: "Bike",
          category: "cycling",
          condition: "GOOD",
          price_amount: 12000,
          currency: "EUR",
          geo_lat: null,
          geo_lng: null,
          status: "LIVE"
        }
      ]
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const matchListing = vi.fn(async () => {
      throw new Error("temporary match failure");
    });

    const summary = await runWatchlistMatchQueue({
      client,
      matchListing,
      now
    });

    expect(summary).toMatchObject({
      scanned_count: 1,
      processed_count: 1,
      success_count: 0,
      error_count: 1
    });
    expect(client.queue).toHaveLength(1);
    expect(client.queue[0]).toEqual(
      expect.objectContaining({
        attempt_count: 3,
        last_error: "temporary match failure",
        updated_at: now.toISOString()
      })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "watchlist.match_queue_row_failed",
      expect.objectContaining({ entity_type: "listing", entity_id: listingId })
    );
  });

  it("reports success and errors independently for FR, GB, and ES", async () => {
    const now = new Date("2026-07-23T08:00:00.000Z");
    const queue = [
      { entity_type: "deal" as const, entity_id: "deal-fr", updated_at: "2026-07-23T07:00:00.000Z", attempt_count: 0 },
      { entity_type: "deal" as const, entity_id: "deal-gb", updated_at: "2026-07-23T07:01:00.000Z", attempt_count: 0 },
      { entity_type: "deal" as const, entity_id: "deal-es", updated_at: "2026-07-23T07:02:00.000Z", attempt_count: 0 }
    ];
    const client = new FakeSupabaseClient({
      queue,
      deals: [
        { deal_id: "deal-fr", market_code: "FR", status: "ACTIVE" },
        { deal_id: "deal-gb", market_code: "GB", status: "ACTIVE" },
        { deal_id: "deal-es", market_code: "ES", status: "ACTIVE" }
      ]
    });
    const matchDeal = vi.fn(async ({ deal }: { deal: any }) => {
      if (deal.market_code === "ES") throw new Error("ES matcher unavailable");
      return {
        ok: true,
        market_code: deal.market_code,
        matched_count: deal.market_code === "FR" ? 2 : 1,
        inserted_count: 1
      };
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const summary = await runWatchlistMatchQueue({ client, matchDeal, now });

    expect(summary).toMatchObject({
      scanned_count: 3,
      processed_count: 3,
      success_count: 2,
      error_count: 1,
      matched_count: 3,
      inserted_count: 2,
      markets: {
        FR: { processed_count: 1, error_count: 0, matched_count: 2, inserted_count: 1 },
        GB: { processed_count: 1, error_count: 0, matched_count: 1, inserted_count: 1 },
        ES: { processed_count: 0, error_count: 1, matched_count: 0, inserted_count: 0 }
      }
    });
    expect(client.queue).toEqual([
      expect.objectContaining({
        entity_id: "deal-es",
        attempt_count: 1,
        last_error: "ES matcher unavailable",
        updated_at: now.toISOString()
      })
    ]);
  });

  it.each([
    {
      entityType: "deal" as const,
      entityId: "44444444-4444-4444-8444-444444444444",
      entitiesKey: "deals" as const,
      entity: {
        deal_id: "44444444-4444-4444-8444-444444444444",
        title: "Console",
        tags: [],
        price: 100,
        currency: "EUR",
        status: "ACTIVE"
      }
    },
    {
      entityType: "listing" as const,
      entityId: "55555555-5555-4555-8555-555555555555",
      entitiesKey: "listings" as const,
      entity: {
        listing_id: "55555555-5555-4555-8555-555555555555",
        title: "Bike",
        category: "cycling",
        condition: "GOOD",
        price_amount: 12000,
        currency: "EUR",
        geo_lat: null,
        geo_lng: null,
        status: "LIVE"
      }
    }
  ])("keeps an overflowing $entityType row for retry", async ({ entityType, entityId, entitiesKey, entity }) => {
    const updatedAt = "2026-02-08T00:00:00.000Z";
    const now = new Date("2026-02-08T00:05:00.000Z");
    const client = new FakeSupabaseClient({
      queue: [{ entity_type: entityType, entity_id: entityId, updated_at: updatedAt, attempt_count: 0 }],
      [entitiesKey]: [entity]
    });
    const incompleteResult = vi.fn(async () => ({
      ok: false,
      reason: "overflow",
      matched_count: 2001
    }));

    const summary = await runWatchlistMatchQueue({
      client,
      now,
      ...(entityType === "deal" ? { matchDeal: incompleteResult } : { matchListing: incompleteResult })
    });

    expect(summary).toMatchObject({
      scanned_count: 1,
      processed_count: 1,
      success_count: 0,
      error_count: 1,
      matched_count: 0,
      inserted_count: 0
    });
    expect(client.queue).toHaveLength(1);
    expect(client.queue[0]).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        last_error: "Watchlist matching did not complete: overflow",
        updated_at: now.toISOString()
      })
    );
  });

  it("drops stale listing queue rows when the listing is no longer live", async () => {
    const listingId = "33333333-3333-4333-8333-333333333333";
    const client = new FakeSupabaseClient({
      queue: [{ entity_type: "listing", entity_id: listingId, updated_at: "2026-02-08T00:00:00.000Z" }],
      listings: [{ listing_id: listingId, title: "Draft", status: "DRAFT" }]
    });

    const matchListing = vi.fn();
    const summary = await runWatchlistMatchQueue({ client, matchListing });

    expect(summary).toMatchObject({
      scanned_count: 1,
      processed_count: 0,
      skipped_count: 1,
      success_count: 0,
      error_count: 0
    });
    expect(matchListing).not.toHaveBeenCalled();
    expect(client.queue).toHaveLength(0);
  });
});
