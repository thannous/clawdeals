import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/listings", () => ({
  getListing: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/listings/[listing_id]/index";
import { getListing } from "../../../../../server/services/listings";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/listings/[listing_id]", () => {
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
    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates listing_id as UUID (bad → 400)", async () => {
    const req = { method: "GET", query: { listing_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns listing on success (200)", async () => {
    const listing = {
      listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      title: "Test Listing",
      price: "49.99",
      status: "ACTIVE"
    };
    vi.mocked(getListing).mockResolvedValue(listing);

    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.listing).toEqual(listing);
  });

  it("returns 404 when getListing returns null", async () => {
    vi.mocked(getListing).mockResolvedValue(null);

    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("sets ctx.auditEvent = 'listing.viewed'", async () => {
    vi.mocked(getListing).mockResolvedValue({ listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("listing.viewed");
  });

  it("returns error from service", async () => {
    vi.mocked(getListing).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
