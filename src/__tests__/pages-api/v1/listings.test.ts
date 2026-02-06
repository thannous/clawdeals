import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/listings", () => ({
  createListing: vi.fn(),
  listListings: vi.fn()
}));

vi.mock("../../../server/services/approvals", () => ({
  createApproval: vi.fn()
}));

vi.mock("../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn()
}));

vi.mock("../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn()
}));

vi.mock("../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../pages/api/v1/listings";
import { createListing, listListings } from "../../../server/services/listings";
import { createApproval } from "../../../server/services/approvals";
import { getPolicyOrDefault } from "../../../server/services/policies";
import { resolveTrustContext } from "../../../server/trustscore/context";
import { publishSseEvent } from "../../../server/sse/store";
import { encodeListingsCursor } from "../../../server/services/listings-cursor";

const createListingMock = vi.mocked(createListing);
const listListingsMock = vi.mocked(listListings);
const createApprovalMock = vi.mocked(createApproval);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const resolveTrustContextMock = vi.mocked(resolveTrustContext);
const publishSseEventMock = vi.mocked(publishSseEvent);

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

const validBody: any = {
  title: "Test listing",
  description: "desc",
  category: "electronics",
  condition: "GOOD",
  price: { amount: 90000, currency: "EUR" },
  publish: true
};

describe("/v1/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST requires Idempotency-Key", async () => {
    const req: any = { method: "POST", headers: {}, body: validBody };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(String(result.body.error.message)).toContain("Idempotency-Key");
  });

  it("POST requires agent authentication", async () => {
    const req: any = { method: "POST", headers: { "idempotency-key": "abc" }, body: validBody };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST validates condition", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, condition: "BAD" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST validates geo ranges", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, geo: { lat: 91, lng: 2 } }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST validates photos schema", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, photos: [{ mime: "image/png" }] }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST publish=false creates DRAFT without approval", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: [] } } } as any);
    createListingMock.mockResolvedValue({
      listing_id: "l1",
      status: "DRAFT",
      created_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: false }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.listing_id).toBe("l1");
    expect(result.body.status).toBe("DRAFT");
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(publishSseEventMock).toHaveBeenCalled();
  });

  it("POST blocks publish when trust restricted", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: ["restricted"], quarantine_applied: true } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("TRUST_RESTRICTED");
    expect(createListingMock).not.toHaveBeenCalled();
  });

  it("POST blocks quarantined publish when ownerId is missing", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: true } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true }
    };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(createListingMock).not.toHaveBeenCalled();
  });

  it("POST policy requires approval => PENDING_APPROVAL + createApproval(listing_publish)", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: [] } } } as any);
    createListingMock.mockResolvedValue({
      listing_id: "l1",
      status: "PENDING_APPROVAL",
      created_at: "2026-02-06T12:00:00Z"
    } as any);
    createApprovalMock.mockResolvedValue({ approval_id: "a1" } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.status).toBe("PENDING_APPROVAL");

    expect(createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "listing_publish",
        actionRefId: "l1",
        actionPayload: { listing_id: "l1" }
      })
    );
  });

  it("GET requires agent authentication", async () => {
    const req: any = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET returns 400 GEO_REQUIRED when distance_km provided without lat/lng", async () => {
    const req: any = { method: "GET", query: { distance_km: "10" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("GEO_REQUIRED");
  });

  it("GET returns 501 GEO_NOT_SUPPORTED when geo requested", async () => {
    const req: any = { method: "GET", query: { lat: "1", lng: "2" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(501);
    expect(result.body.error.code).toBe("GEO_NOT_SUPPORTED");
  });

  it("GET validates cursor sort mismatch", async () => {
    const cursor = encodeListingsCursor({
      sort: "price_asc",
      price_amount: 100,
      listing_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4"
    });

    const req: any = { method: "GET", query: { sort: "recent", cursor } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET returns data + next_cursor", async () => {
    listListingsMock.mockResolvedValue({
      items: [
        {
          listing_id: "l1",
          title: "T",
          category: "electronics",
          condition: "GOOD",
          price_amount: 100,
          currency: "EUR",
          created_at: "2026-02-06T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    } as any);

    const req: any = { method: "GET", query: {} };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("listings.listed");
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].listing_id).toBe("l1");
    expect(result.body.data[0].price.amount).toBe(100);
    expect(result.body.next_cursor).toBe("cursor-abc");
    expect(listListings).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: "recent",
        limit: 50,
        cursor: null
      })
    );
  });
});
