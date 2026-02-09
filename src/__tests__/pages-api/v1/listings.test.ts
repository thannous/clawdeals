import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/services/listings", () => ({
  createListing: vi.fn(),
  listListings: vi.fn()
}));

vi.mock("../../../server/services/listings-duplicates", () => ({
  findListingDuplicate: vi.fn()
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

vi.mock("../../../server/services/watchlist-matching", () => ({
  matchListingToWatchlists: vi.fn()
}));

import { handler } from "../../../pages/api/v1/listings";
import { createListing, listListings } from "../../../server/services/listings";
import { findListingDuplicate } from "../../../server/services/listings-duplicates";
import { createApproval } from "../../../server/services/approvals";
import { getPolicyOrDefault } from "../../../server/services/policies";
import { resolveTrustContext } from "../../../server/trustscore/context";
import { publishSseEvent } from "../../../server/sse/store";
import { matchListingToWatchlists } from "../../../server/services/watchlist-matching";
import { encodeListingsCursor } from "../../../server/services/listings-cursor";

const createListingMock = vi.mocked(createListing);
const listListingsMock = vi.mocked(listListings);
const findListingDuplicateMock = vi.mocked(findListingDuplicate);
const createApprovalMock = vi.mocked(createApproval);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const resolveTrustContextMock = vi.mocked(resolveTrustContext);
const publishSseEventMock = vi.mocked(publishSseEvent);
const matchListingToWatchlistsMock = vi.mocked(matchListingToWatchlists);

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
    findListingDuplicateMock.mockResolvedValue(null as any);
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
    expect(findListingDuplicateMock).not.toHaveBeenCalled();
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
        ownerId: "owner-1",
        actionType: "listing_publish",
        actionRef: expect.objectContaining({ listing_id: "l1", seller_agent_id: "agent-1" }),
        actionRefId: "l1",
        actionPayload: { listing_id: "l1" },
        createdByAgentId: "agent-1"
      })
    );
  });

  it("POST returns 409 DUPLICATE_SUSPECTED when a recent duplicate is found (no force_create)", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: ["listing.create"] } } } as any);
    findListingDuplicateMock.mockResolvedValue({
      listing_id: "dup-1",
      created_at: "2026-02-06T12:00:00Z",
      status: "LIVE"
    } as any);

    const req: any = { method: "POST", headers: { "idempotency-key": "abc" }, body: { ...validBody, publish: true } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("DUPLICATE_SUSPECTED");
    expect(result.body.error.meta).toEqual(
      expect.objectContaining({
        existing_listing_id: "dup-1",
        existing_created_at: "2026-02-06T12:00:00Z",
        existing_status: "LIVE"
      })
    );

    expect(findListingDuplicateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(createListingMock).not.toHaveBeenCalled();
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(publishSseEventMock).not.toHaveBeenCalled();
  });

  it("POST force_create requires owner authentication when overriding a duplicate", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    findListingDuplicateMock.mockResolvedValue({
      listing_id: "dup-1",
      created_at: "2026-02-06T12:00:00Z",
      status: "LIVE"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true, force_create: true }
    };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(createListingMock).not.toHaveBeenCalled();
  });

  it("POST force_create creates PENDING_APPROVAL when duplicate override policy requires approval", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: ["listing.create"] } } } as any);
    findListingDuplicateMock.mockResolvedValue({
      listing_id: "dup-1",
      created_at: "2026-02-06T12:00:00Z",
      status: "LIVE"
    } as any);
    createListingMock.mockResolvedValue({
      listing_id: "l-force-1",
      status: "PENDING_APPROVAL",
      created_at: "2026-02-06T12:00:00Z"
    } as any);
    createApprovalMock.mockResolvedValue({ approval_id: "a-force-1" } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true, force_create: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.listing_id).toBe("l-force-1");
    expect(result.body.status).toBe("PENDING_APPROVAL");

    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING_APPROVAL",
        duplicateOverride: true,
        duplicateFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(createApprovalMock).toHaveBeenCalled();
  });

  it("POST force_create creates LIVE when duplicate override policy is auto-approved", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { auto_approve: { actions: ["listing.create", "listing.force_create"] } }
    } as any);
    findListingDuplicateMock.mockResolvedValue({
      listing_id: "dup-1",
      created_at: "2026-02-06T12:00:00Z",
      status: "LIVE"
    } as any);
    createListingMock.mockResolvedValue({
      listing_id: "l-force-2",
      status: "LIVE",
      created_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, publish: true, force_create: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.listing_id).toBe("l-force-2");
    expect(result.body.status).toBe("LIVE");

    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "LIVE",
        duplicateOverride: true,
        duplicateFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(matchListingToWatchlistsMock).toHaveBeenCalled();
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

  it("GET returns 400 GEO_REQUIRED when lat is provided without lng", async () => {
    const req: any = { method: "GET", query: { lat: "1" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("GEO_REQUIRED");
  });

  it("GET returns 400 GEO_REQUIRED when sort=distance without lat/lng", async () => {
    const req: any = { method: "GET", query: { sort: "distance" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("GEO_REQUIRED");
  });

  it("GET returns 400 when geo is used with a non-distance sort", async () => {
    const req: any = { method: "GET", query: { lat: "1", lng: "2", sort: "recent" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
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

  it("GET defaults to sort=distance when lat/lng provided and maps distance_km", async () => {
    listListingsMock.mockResolvedValue({
      items: [
        {
          listing_id: "l1",
          title: "T",
          category: "electronics",
          condition: "GOOD",
          price_amount: 100,
          currency: "EUR",
          distance_m: 1234.567,
          created_at: "2026-02-06T12:00:00Z"
        }
      ],
      nextCursor: null
    } as any);

    const req: any = { method: "GET", query: { lat: "1.23", lng: "2.34" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].distance_km).toBe(1.235);

    expect(listListings).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: "distance",
        limit: 50,
        cursor: null,
        geo: expect.objectContaining({ lat: 1.23, lng: 2.34, distanceKm: null })
      })
    );
  });

  it("GET passes distance_km through to geo.distanceKm when sort=distance", async () => {
    listListingsMock.mockResolvedValue({ items: [], nextCursor: null } as any);

    const req: any = { method: "GET", query: { lat: "1", lng: "2", sort: "distance", distance_km: "10" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);

    expect(listListings).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: "distance",
        geo: expect.objectContaining({ lat: 1, lng: 2, distanceKm: 10 })
      })
    );
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

