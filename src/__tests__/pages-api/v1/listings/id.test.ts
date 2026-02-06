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

  it("returns 405 for non-PATCH", async () => {
    const req: any = { method: "GET", headers: {}, query: { id: listingId } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when agent authentication is missing", async () => {
    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { title: "x" } };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates listing id UUID", async () => {
    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: "not-a-uuid" }, body: { title: "x" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires Idempotency-Key", async () => {
    const req: any = { method: "PATCH", headers: {}, query: { id: listingId }, body: { title: "x" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(String(result.body.error.message)).toContain("Idempotency-Key");
  });

  it("requires at least one field", async () => {
    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for non-seller (anti-enumeration)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-2", owner_id: "owner-1", status: "LIVE" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { title: "New title" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 LISTING_LOCKED for system-controlled states", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "RESERVED" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { price: { amount: 123, currency: "EUR" } } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("LISTING_LOCKED");
  });

  it("returns 400 for invalid status values (only LIVE/REMOVED are accepted)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "DRAFT" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "RESERVED" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 INVALID_STATUS_TRANSITION for LIVE when current status is not DRAFT", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "LIVE" } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "LIVE" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("updates price/title/description in allowed states (DRAFT/PENDING_APPROVAL/LIVE)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "LIVE" } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "LIVE",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = {
      method: "PATCH",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { title: "New title", description: "New desc", price: { amount: 88000, currency: "EUR" } }
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.listing_id).toBe(listingId);
    expect(result.body.status).toBe("LIVE");

    expect(updateListingBySellerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId,
        sellerAgentId: "agent-1",
        expectedStatus: "LIVE",
        patch: expect.objectContaining({
          title: "New title",
          description: "New desc",
          price_amount: 88000,
          currency: "EUR"
        })
      })
    );
    expect(publishSseEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: "listing.updated" }));
    expect(ctx.auditEvent).toBe("listing.updated");
  });

  it("LIVE -> REMOVED is allowed (status_changed + SSE)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "LIVE" } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "REMOVED",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "REMOVED" } };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("REMOVED");
    expect(publishSseEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "listing.updated",
        payload: expect.objectContaining({ previous_status: "LIVE", new_status: "REMOVED" })
      })
    );
    expect(ctx.auditEvent).toBe("listing.status_changed");
  });

  it("DRAFT -> LIVE becomes PENDING_APPROVAL when policy requires approval (creates approval)", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "DRAFT" } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "PENDING_APPROVAL",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);
    createApprovalMock.mockResolvedValue({ approval_id: "a1", state: "PENDING" } as any);

    // Default mock policy has no allowlisted actions, so evaluatePolicyAction should require approval.
    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "LIVE" } };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(createApprovalMock).toHaveBeenCalledWith(expect.objectContaining({ actionType: "listing_publish" }));
    expect(result.body.status).toBe("PENDING_APPROVAL");
    expect(publishSseEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "listing.updated",
        payload: expect.objectContaining({ approval_id: "a1", new_status: "PENDING_APPROVAL" })
      })
    );
    expect(ctx.policy?.approval_id).toBe("a1");
  });

  it("DRAFT -> LIVE becomes LIVE when policy auto-approves", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "DRAFT" } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "LIVE",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    // Prefer "listing.publish"; compat also accepts legacy "listing.create".
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: ["listing.publish"] } } } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "LIVE" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(result.body.status).toBe("LIVE");
  });

  it("blocks publish when trust restricted", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "DRAFT" } as any);
    resolveTrustContextMock.mockResolvedValue({ trust_flags: ["restricted"], quarantine_applied: true } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "LIVE" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("TRUST_RESTRICTED");
    expect(updateListingBySellerMock).not.toHaveBeenCalled();
  });

  it("cancels listing_publish approval when PENDING_APPROVAL -> REMOVED", async () => {
    getListingMock.mockResolvedValue({ listing_id: listingId, seller_agent_id: "agent-1", owner_id: "owner-1", status: "PENDING_APPROVAL" } as any);
    updateListingBySellerMock.mockResolvedValue({
      listing_id: listingId,
      status: "REMOVED",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    const req: any = { method: "PATCH", headers: { "idempotency-key": "idem-1" }, query: { id: listingId }, body: { status: "REMOVED" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(cancelPendingListingPublishApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        listingId
      })
    );
  });
});
