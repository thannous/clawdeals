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

import { handler } from "../../../pages/api/v1/listings";
import { createListing, listListings } from "../../../server/services/listings";
import { findListingDuplicate } from "../../../server/services/listings-duplicates";
import { createApproval } from "../../../server/services/approvals";
import { getPolicyOrDefault } from "../../../server/services/policies";
import { resolveTrustContext } from "../../../server/trustscore/context";
import { publishSseEvent } from "../../../server/sse/store";
import { encodeListingsCursor } from "../../../server/services/listings-cursor";

const createListingMock = vi.mocked(createListing);
const listListingsMock = vi.mocked(listListings);
const findListingDuplicateMock = vi.mocked(findListingDuplicate);
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
    findListingDuplicateMock.mockResolvedValue(null as any);
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

  it("POST accepts canonical images and defaults cover_image_index to 0", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    createListingMock.mockResolvedValue({
      listing_id: "l-img-1",
      status: "DRAFT",
      created_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: {
        ...validBody,
        publish: false,
        images: [
          { storage_key: "listings/l-img-1/1.jpg", mime: "image/jpeg" },
          { storage_key: "listings/l-img-1/2.jpg", mime: "image/jpeg" }
        ]
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        photos: [
          { storage_key: "listings/l-img-1/1.jpg", mime: "image/jpeg" },
          { storage_key: "listings/l-img-1/2.jpg", mime: "image/jpeg" }
        ],
        coverImageIndex: 0
      })
    );
  });

  it("POST rejects conflict when images and photos differ", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: {
        ...validBody,
        images: [{ storage_key: "listings/l1/a.jpg", mime: "image/jpeg" }],
        photos: [{ storage_key: "listings/l1/b.jpg", mime: "image/jpeg" }]
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
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
});
