import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/public-listings", () => ({
  listPublicListings: vi.fn(),
}));

vi.mock("../../../../server/services/listings-cursor", () => ({
  decodeListingsCursor: vi.fn(),
}));

import handler from "../../../../pages/api/v1/public/listings";
import { listPublicListings } from "../../../../server/services/public-listings";
import { decodeListingsCursor } from "../../../../server/services/listings-cursor";

const listMock = vi.mocked(listPublicListings);
const decodeCursorMock = vi.mocked(decodeListingsCursor);

function mockReq(method: string, query: Record<string, string> = {}) {
  return { method, query } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe("GET /api/v1/public/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods with 405", async () => {
    const res = mockRes();
    await handler(mockReq("POST"), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(res.headers["allow"]).toBe("GET");
  });

  it("returns 200 with listings data", async () => {
    listMock.mockResolvedValue({
      items: [
        {
          listing_id: "abc",
          market_code: "FR",
          title: "Test",
          description: "Description",
          category: "HARDWARE",
          condition: "LIKE_NEW",
          price: {
            amount: 12345,
            currency: "EUR",
          },
          images_count: 0,
          cover_image: null,
          distance_km: null,
          created_at: "2026-02-16T00:00:00.000Z",
          seller: {
            display_name: "Seller",
            avatar_url: null,
            verified: true,
          },
        },
      ],
      nextCursor: "next-cursor-val",
    });

    const res = mockRes();
    await handler(mockReq("GET"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].listing_id).toBe("abc");
    expect(res.body.next_cursor).toBe("next-cursor-val");
  });

  it("sets cache-control header", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET"), res);

    expect(res.headers["cache-control"]).toContain("public");
    expect(res.headers["cache-control"]).toContain("s-maxage=60");
  });

  it("passes sort parameter to service", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { sort: "price_asc" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "price_asc" })
    );
  });

  it("defaults invalid sort to recent", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { sort: "invalid" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "recent" })
    );
  });

  it("passes validated geo inputs for distance search", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(
      mockReq("GET", {
        sort: "distance",
        lat: "48.8566",
        lng: "2.3522",
        distance_km: "25"
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: "distance",
        geo: { lat: 48.8566, lng: 2.3522, distanceKm: 25 }
      })
    );
  });

  it("rejects incomplete or out-of-range distance searches", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const missing = mockRes();
    await handler(mockReq("GET", { sort: "distance", lat: "48.8566" }), missing);
    expect(missing.statusCode).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const invalid = mockRes();
    await handler(
      mockReq("GET", { sort: "distance", lat: "91", lng: "2.3", distance_km: "25" }),
      invalid
    );
    expect(invalid.statusCode).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("passes search query", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { q: "laptop" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: "laptop" })
    );
  });

  it("trims search query and ignores empty", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { q: "   " }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: null })
    );
  });

  it("rejects search query longer than 200 chars", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { q: "A".repeat(201) }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: null })
    );
  });

  it("normalizes condition to uppercase", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { condition: "like_new" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ condition: "LIKE_NEW" })
    );
  });

  it("ignores invalid condition", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { condition: "BROKEN" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ condition: null })
    );
  });

  it("parses price_min and price_max as integers", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { price_min: "100", price_max: "500" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ priceMin: 100, priceMax: 500 })
    );
  });

  it("ignores negative price values", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { price_min: "-10", price_max: "-1" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ priceMin: undefined, priceMax: undefined })
    );
  });

  it("ignores non-numeric price values", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { price_min: "abc" }), res);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ priceMin: undefined })
    );
  });

  it("clamps limit to 1-30 range", async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });

    const res = mockRes();
    await handler(mockReq("GET", { limit: "50" }), res);

    // limit > 30 → ignored, falls back to default 24
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 24 })
    );
  });

  it("returns 400 for invalid cursor", async () => {
    decodeCursorMock.mockReturnValue({ error: "Invalid cursor format" } as any);

    const res = mockRes();
    await handler(mockReq("GET", { cursor: "bad-cursor" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when cursor sort does not match", async () => {
    decodeCursorMock.mockReturnValue({ value: { sort: "price_asc" } } as any);

    const res = mockRes();
    await handler(mockReq("GET", { cursor: "valid-cursor", sort: "recent" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toContain("cursor does not match sort");
  });

  it("returns 500 on service error", async () => {
    listMock.mockRejectedValue(new Error("DB connection failed"));

    const res = mockRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await handler(mockReq("GET"), res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe("ERROR");
  });
});
