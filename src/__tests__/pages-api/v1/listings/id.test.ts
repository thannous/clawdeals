import { beforeEach, describe, expect, it, vi } from "vitest";

// TI-195 (US-3-LST-03) targets: PATCH /v1/listings/{listing_id}
//
// Tests are written at the API handler layer and mock:
// - services (listing fetch, policy, approvals)
// - trust context
// - SSE publishing
// - DB writes (Supabase client) used by the handler's internal updateListing()

vi.mock("../../../../server/services/listings", () => ({
  getListing: vi.fn(),
  updateListingBySeller: vi.fn()
}));

vi.mock("../../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn()
}));

vi.mock("../../../../server/services/approvals", () => ({
  createApproval: vi.fn(),
  cancelPendingListingPublishApproval: vi.fn()
}));

vi.mock("../../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/listings/[id]";
import { getListing, updateListingBySeller } from "../../../../server/services/listings";
import { getPolicyOrDefault } from "../../../../server/services/policies";
import { cancelPendingListingPublishApproval, createApproval } from "../../../../server/services/approvals";
import { resolveTrustContext } from "../../../../server/trustscore/context";
import { publishSseEvent } from "../../../../server/sse/store";

const getListingMock = vi.mocked(getListing);
const updateListingBySellerMock = vi.mocked(updateListingBySeller);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const createApprovalMock = vi.mocked(createApproval);
const cancelPendingListingPublishApprovalMock = vi.mocked(cancelPendingListingPublishApproval);
const resolveTrustContextMock = vi.mocked(resolveTrustContext);
const publishSseEventMock = vi.mocked(publishSseEvent);

const listingId = "11111111-1111-4111-8111-111111111111";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("PATCH /v1/listings/{id} (TI-195)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: [] } } } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "LIVE",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);
  });

  it("returns 404 for non-seller agent non-media patch (anti-enumeration)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-2", owner_id: "owner-1", status: "LIVE" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { title: "New title" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 for owner non-media patch when owner is not seller", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-2", owner_id: "owner-1", status: "LIVE" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-owner-1" }, query: { id: listingId }, body: { title: "New title" } };
    const result: any = await handler(req, null, {
      ...baseCtx,
      agentId: null,
      actor: { type: "owner", id: "owner-1" }
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("allows media patch by owner even when owner is not seller", async () => {
    getListingMock.mockResolvedValue({
      listing_id: listingId,
      seller_agent_id: "agent-2",
      owner_id: "owner-1",
      status: "LIVE",
      photos: [{ storage_key: "k1", mime: "image/jpeg" }],
      cover_image_index: 0
    } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "LIVE",
      photos: [{ storage_key: "k2", mime: "image/jpeg" }],
      cover_image_index: 0,
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = {
      method: "PATCH",
      headers: { "idempotency-key": "idem-owner-media" },
      query: { id: listingId },
      body: { images: [{ storage_key: "k2", mime: "image/jpeg" }] }
    };
    const result: any = await handler(req, null, {
      ...baseCtx,
      agentId: null,
      actor: { type: "owner", id: "owner-1" }
    });

    expect(result.status).toBe(200);
    expect(updateListingBySellerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerAgentId: "agent-2",
        patch: expect.objectContaining({
          photos: [{ storage_key: "k2", mime: "image/jpeg" }],
          cover_image_index: 0
        })
      })
    );
  });

  it("returns 404 for media patch by third-party (anti-enumeration)", async () => {
    getListingMock.mockResolvedValue({
      listing_id: listingId,
      seller_agent_id: "agent-2",
      owner_id: "owner-1",
      status: "LIVE",
      photos: [{ storage_key: "k1", mime: "image/jpeg" }],
      cover_image_index: 0
    } as any);

    const req: any = {
      method: "PATCH",
      headers: { "idempotency-key": "idem-third-party-media" },
      query: { id: listingId },
      body: { images: [{ storage_key: "k2", mime: "image/jpeg" }] }
    };
    const result: any = await handler(req, null, {
      ...baseCtx,
      ownerId: "owner-9",
      agentId: "agent-x",
      actor: { type: "agent", id: "agent-x" }
    });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("validates conflict when images and photos differ", async () => {
    getListingMock.mockResolvedValue({
      listing_id: listingId,
      seller_agent_id: "agent-1",
      owner_id: "owner-1",
      status: "LIVE",
      photos: [],
      cover_image_index: null
    } as any);

    const req: any = {
      method: "PATCH",
      headers: { "idempotency-key": "idem-conflict-media" },
      query: { id: listingId },
      body: {
        images: [{ storage_key: "img-a", mime: "image/jpeg" }],
        photos: [{ storage_key: "img-b", mime: "image/jpeg" }]
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks quarantined publish when ownerId is missing", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: null, status: "DRAFT" } as any);
    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: true } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "LIVE" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(updateListingBySellerMock).not.toHaveBeenCalled();
  });
});
