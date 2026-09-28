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
});
