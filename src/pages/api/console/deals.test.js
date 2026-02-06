import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/deals-list", () => ({
  listDeals: vi.fn(),
  DEALS_DEFAULT_LIMIT: 30,
  DEALS_MAX_LIMIT: 100
}));

vi.mock("../../../server/services/deals-cursor", () => ({
  decodeDealsCursor: vi.fn()
}));

import { handler } from "./deals";
import { listDeals } from "../../../server/services/deals-list";
import { decodeDealsCursor } from "../../../server/services/deals-cursor";

const baseCtx = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns items and next_cursor", async () => {
    listDeals.mockResolvedValue({
      items: [
        {
          deal_id: "d1",
          title: "Deal 1",
          source_url: "https://example.com/1",
          price: "29.99",
          currency: "EUR",
          expires_at: "2026-03-01T00:00:00Z",
          tags: ["gpu"],
          status: "ACTIVE",
          temperature: 72,
          votes_up: 5,
          votes_down: 1,
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: { sort: "new" } };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].deal_id).toBe("d1");
    expect(result.body.items[0].price).toBe(29.99);
    expect(result.body.items[0].temperature).toBe(72);
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("masks temperature for NEW deals", async () => {
    listDeals.mockResolvedValue({
      items: [
        {
          deal_id: "d2",
          title: "New Deal",
          source_url: "https://example.com/2",
          price: "10.00",
          currency: "USD",
          expires_at: "2026-03-01T00:00:00Z",
          tags: [],
          status: "NEW",
          temperature: 50,
          votes_up: 0,
          votes_down: 0,
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: null
    });

    const req = { method: "GET", query: {} };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items[0].temperature).toBeNull();
    expect(result.body.next_cursor).toBeNull();
  });

  it("passes sort, statuses, q, tags to listDeals", async () => {
    listDeals.mockResolvedValue({ items: [], nextCursor: null });

    const req = {
      method: "GET",
      query: { sort: "temp", status: ["ACTIVE"], q: "laptop", tags: "gpu,nvidia" }
    };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listDeals).toHaveBeenCalledWith(expect.objectContaining({
      sort: "temp",
      statuses: ["ACTIVE"],
      q: "laptop",
      tags: ["gpu", "nvidia"]
    }));
  });

  it("handles comma-separated status param", async () => {
    listDeals.mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { status: "NEW,ACTIVE,EXPIRED" } };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listDeals).toHaveBeenCalledWith(expect.objectContaining({
      statuses: ["NEW", "ACTIVE", "EXPIRED"]
    }));
  });

  it("returns 400 for malformed cursor", async () => {
    decodeDealsCursor.mockReturnValue({ error: "Invalid cursor" });

    const req = { method: "GET", query: { cursor: "bad-cursor" } };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("passes decoded cursor to listDeals", async () => {
    const cursorValue = { sort: "new", status: "ACTIVE", created_at: "2026-02-01T00:00:00Z", deal_id: "d1" };
    decodeDealsCursor.mockReturnValue({ value: cursorValue });
    listDeals.mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { cursor: "valid-cursor" } };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listDeals).toHaveBeenCalledWith(expect.objectContaining({
      cursor: cursorValue
    }));
  });

  it("returns 500 on service error", async () => {
    listDeals.mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: {} };
    const result = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("defaults limit to 30", async () => {
    listDeals.mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: {} };
    await handler(req, null, { ...baseCtx });

    expect(listDeals).toHaveBeenCalledWith(expect.objectContaining({ limit: 30 }));
  });

  it("respects custom limit", async () => {
    listDeals.mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { limit: "10" } };
    await handler(req, null, { ...baseCtx });

    expect(listDeals).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("converts string price to number", async () => {
    listDeals.mockResolvedValue({
      items: [{
        deal_id: "d3", title: "Price Deal", source_url: "https://x.com", price: "99.50",
        currency: "EUR", expires_at: null, tags: [], status: "ACTIVE", temperature: 10,
        votes_up: 0, votes_down: 0, created_at: "2026-02-05T12:00:00Z"
      }],
      nextCursor: null
    });

    const req = { method: "GET", query: {} };
    const result = await handler(req, null, { ...baseCtx });

    expect(typeof result.body.items[0].price).toBe("number");
    expect(result.body.items[0].price).toBe(99.5);
  });
});
