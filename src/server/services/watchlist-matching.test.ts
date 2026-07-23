import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn()
}));

vi.mock("../sse/store", () => ({
  publishSseEvent: vi.fn()
}));

vi.mock("./notification-outbox", () => ({
  enqueueWatchlistMatchOutbox: vi.fn()
}));

import { rateLimitMiddleware } from "../rate-limit/middleware";
import { publishSseEvent } from "../sse/store";
import { enqueueWatchlistMatchOutbox } from "./notification-outbox";
import { matchDealToWatchlists, matchListingToWatchlists } from "./watchlist-matching";

type Filter = {
  column: string;
  operator: "eq" | "is" | "not-is" | "overlaps" | "gte" | "in";
  value: any;
};

class MatchingClient {
  watchlists: any[];
  insertedMatches: any[] = [];
  deliveredMatchIds: string[][] = [];
  watchlistQueryFilters: Filter[][] = [];

  constructor(watchlists: any[]) {
    this.watchlists = watchlists;
  }

  from(table: string) {
    return new MatchingQuery(this, table);
  }
}

class MatchingQuery {
  private client: MatchingClient;
  private table: string;
  private operation: "select" | "upsert" | "update" | null = null;
  private filters: Filter[] = [];
  private rows: any[] = [];

  constructor(client: MatchingClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select(_columns: string) {
    if (!this.operation) this.operation = "select";
    return this;
  }

  upsert(rows: any[], _options: any) {
    this.operation = "upsert";
    this.rows = rows;
    return this;
  }

  update(_patch: any) {
    this.operation = "update";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ column, operator: "is", value });
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator !== "is") throw new Error(`Unexpected not operator: ${operator}`);
    this.filters.push({ column, operator: "not-is", value });
    return this;
  }

  overlaps(column: string, value: any[]) {
    this.filters.push({ column, operator: "overlaps", value });
    return this;
  }

  gte(column: string, value: number) {
    this.filters.push({ column, operator: "gte", value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ column, operator: "in", value });
    return this;
  }

  limit(_value: number) {
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private rowMatches(row: any) {
    return this.filters.every((filter) => {
      if (filter.operator === "eq" || filter.operator === "is") {
        return row?.[filter.column] === filter.value;
      }
      if (filter.operator === "not-is") {
        return row?.[filter.column] !== filter.value;
      }
      if (filter.operator === "overlaps") {
        const values = Array.isArray(row?.[filter.column]) ? row[filter.column] : [];
        return values.some((value) => filter.value.includes(value));
      }
      if (filter.operator === "gte") {
        return Number(row?.[filter.column]) >= filter.value;
      }
      return filter.value.includes(row?.[filter.column]);
    });
  }

  private async execute() {
    if (this.table === "watchlists" && this.operation === "select") {
      this.client.watchlistQueryFilters.push([...this.filters]);
      return {
        data: this.client.watchlists.filter((row) => this.rowMatches(row)).map((row) => ({ ...row })),
        error: null
      };
    }

    if (this.table === "watchlist_matches" && this.operation === "upsert") {
      this.client.insertedMatches.push(...this.rows);
      return {
        data: this.rows.map((row, index) => ({
          watchlist_match_id: `match-${index + 1}`,
          watchlist_id: row.watchlist_id,
          agent_id: row.agent_id
        })),
        error: null
      };
    }

    if (this.table === "watchlist_matches" && this.operation === "update") {
      const ids = this.filters.find((filter) => filter.operator === "in" && filter.column === "watchlist_match_id");
      this.client.deliveredMatchIds.push(ids?.value || []);
      return { data: null, error: null };
    }

    return { data: null, error: new Error(`Unexpected ${this.operation} on ${this.table}`) };
  }
}

function watchlist(overrides: any) {
  return {
    watchlist_id: "wl-default",
    agent_id: "agent-default",
    active: true,
    market_code: "FR",
    currency: "EUR",
    query_text: "console",
    tags: ["gaming"],
    price_max: 250,
    geo_lat: null,
    geo_lon: null,
    distance_km: null,
    criteria: null,
    deleted_at: null,
    ...overrides
  };
}

describe("watchlist matching service", () => {
  beforeEach(() => {
    vi.mocked(rateLimitMiddleware).mockResolvedValue(null as any);
    vi.mocked(publishSseEvent).mockResolvedValue({ ok: true } as any);
    vi.mocked(enqueueWatchlistMatchOutbox).mockResolvedValue({ ok: true } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isolates EUR deal candidates by market_code and delivers only the ES match", async () => {
    const client = new MatchingClient([
      watchlist({
        watchlist_id: "wl-es",
        agent_id: "agent-es",
        market_code: "ES"
      }),
      watchlist({
        watchlist_id: "wl-fr",
        agent_id: "agent-fr",
        market_code: "FR"
      })
    ]);
    const now = new Date("2026-07-23T08:00:00.000Z");

    const result = await matchDealToWatchlists({
      client,
      now,
      deal: {
        deal_id: "deal-es",
        title: "Console gaming",
        tags: ["gaming"],
        price: 200,
        currency: "EUR",
        market_code: "ES"
      }
    });

    expect(result).toEqual({
      ok: true,
      market_code: "ES",
      candidates_count: 1,
      matched_count: 1,
      inserted_count: 1
    });
    expect(client.watchlistQueryFilters).toHaveLength(3);
    expect(client.watchlistQueryFilters).toSatisfy((queries: Filter[][]) =>
      queries.every((filters) =>
        filters.some((filter) => filter.operator === "eq" && filter.column === "market_code" && filter.value === "ES")
      )
    );
    expect(client.insertedMatches).toEqual([
      expect.objectContaining({
        watchlist_id: "wl-es",
        agent_id: "agent-es",
        entity_type: "deal",
        entity_id: "deal-es",
        matched_at: now.toISOString()
      })
    ]);
    expect(enqueueWatchlistMatchOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "deal",
        entityId: "deal-es",
        occurredAt: now.toISOString(),
        insertedByAgent: new Map([["agent-es", { watchlistIds: ["wl-es"] }]])
      })
    );
    expect(publishSseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "agent-es",
        entity: { type: "deal", id: "deal-es" },
        payload: expect.objectContaining({
          market_code: "ES",
          watchlist_ids: ["wl-es"]
        })
      })
    );
    expect(client.deliveredMatchIds).toEqual([["match-1"]]);
  });

  it("keeps a GB listing match successful when notification side effects fail", async () => {
    const client = new MatchingClient([
      watchlist({
        watchlist_id: "wl-gb",
        agent_id: "agent-gb",
        market_code: "GB",
        currency: "GBP",
        query_text: "bike",
        tags: ["cycling"],
        geo_lat: 51.5074,
        geo_lon: -0.1278,
        distance_km: 5
      }),
      watchlist({
        watchlist_id: "wl-fr",
        agent_id: "agent-fr",
        market_code: "FR",
        query_text: "bike",
        tags: ["cycling"]
      })
    ]);
    vi.mocked(enqueueWatchlistMatchOutbox).mockRejectedValue(new Error("outbox unavailable"));
    vi.mocked(publishSseEvent).mockResolvedValue({ ok: false, reason: "sse unavailable" } as any);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await matchListingToWatchlists({
      client,
      now: new Date("2026-07-23T08:05:00.000Z"),
      listing: {
        listing_id: "listing-gb",
        title: "Bike commuter",
        category: "cycling",
        price_amount: 200,
        currency: "GBP",
        market_code: "GB",
        geo_lat: 51.5074,
        geo_lng: -0.1278
      }
    });

    expect(result).toMatchObject({
      ok: true,
      market_code: "GB",
      candidates_count: 1,
      matched_count: 1,
      inserted_count: 1
    });
    expect(client.insertedMatches).toEqual([
      expect.objectContaining({
        watchlist_id: "wl-gb",
        agent_id: "agent-gb",
        entity_type: "listing",
        entity_id: "listing-gb"
      })
    ]);
    expect(client.deliveredMatchIds).toEqual([]);
    expect(infoSpy).toHaveBeenCalledWith(
      "notifications.outbox_enqueue_failed",
      expect.objectContaining({ entity_type: "listing", entity_id: "listing-gb", market_code: "GB" })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "watchlist.match_sse_failed",
      expect.objectContaining({ agent_id: "agent-gb", listing_id: "listing-gb", market_code: "GB" })
    );
  });

  it.each([
    ["deal", matchDealToWatchlists, { deal: { title: "Missing id" } }, "deal.deal_id is required"],
    ["listing", matchListingToWatchlists, { listing: { title: "Missing id" } }, "listing.listing_id is required"]
  ])("rejects a %s without an entity id", async (_type, match, input, message) => {
    await expect(match(input as any)).rejects.toMatchObject({
      message,
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });
});
