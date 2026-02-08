import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/listings", () => ({
  listListings: vi.fn()
}));

vi.mock("../../../server/services/listings-cursor", () => ({
  decodeListingsCursor: vi.fn()
}));

import { handler } from "../../../pages/api/console/listings";
import { listListings } from "../../../server/services/listings";
import { decodeListingsCursor } from "../../../server/services/listings-cursor";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns items and next_cursor from listListings", async () => {
    vi.mocked(listListings).mockResolvedValue({
      items: [
        {
          listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          title: "Test Listing",
          price: "49.99",
          currency: "EUR",
          category: "electronics",
          condition: "new",
          status: "ACTIVE",
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].listing_id).toBe("2b079372-0a7a-4fa1-93e0-1f269ea0f1d7");
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("passes filters (q, category, condition, status) to listListings", async () => {
    vi.mocked(listListings).mockResolvedValue({ items: [], nextCursor: null });

    const req = {
      method: "GET",
      query: { q: "laptop", category: "electronics", condition: "new", status: "ACTIVE" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listListings).toHaveBeenCalledWith(expect.objectContaining({
      q: "laptop",
      category: "electronics",
      condition: "new",
      status: "ACTIVE"
    }));
  });

  it("validates sort (invalid → 400)", async () => {
    const req = { method: "GET", query: { sort: "invalid_sort" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates price_min (non-number → 400)", async () => {
    const req = { method: "GET", query: { price_min: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates price_max (non-number → 400)", async () => {
    const req = { method: "GET", query: { price_max: "xyz" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit (non-integer → 400)", async () => {
    const req = { method: "GET", query: { limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit (out of range → 400)", async () => {
    const req = { method: "GET", query: { limit: "999" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeListingsCursor returns error → 400)", async () => {
    vi.mocked(decodeListingsCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("default limit is 50", async () => {
    vi.mocked(listListings).mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: {} };
    await handler(req, null, { ...baseCtx });

    expect(listListings).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("sets ctx.auditEvent = 'listings.listed'", async () => {
    vi.mocked(listListings).mockResolvedValue({ items: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("listings.listed");
  });

  it("handles service error (500 with code)", async () => {
    vi.mocked(listListings).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("custom limit passed to service", async () => {
    vi.mocked(listListings).mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { limit: "25" } };
    await handler(req, null, { ...baseCtx });

    expect(listListings).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });
});
