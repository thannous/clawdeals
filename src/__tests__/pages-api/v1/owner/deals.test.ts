import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/deals-list", () => ({
  listDealsByOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/deals";
import { listDealsByOwner } from "../../../../server/services/deals-list";

const listDealsByOwnerMock = vi.mocked(listDealsByOwner);

const validUuid = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const agentUuid = "d2db4d40-8f3f-5d3e-ae1c-64c88440c9ef";

function makeReq(query: Record<string, string> = {}) {
  return { method: "GET", query };
}

function makeCtx(overrides: any = {}): any {
  return {
    actor: { type: "owner", id: validUuid },
    ownerId: validUuid,
    ...overrides
  };
}

describe("GET /api/v1/owner/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------
  it("returns 405 for non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when authError is set on ctx", async () => {
    const ctx = makeCtx({
      authError: { status: 401, code: "UNAUTHORIZED", message: "Bad token" }
    });
    const result: any = await handler(makeReq(), null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when actor type is neither owner nor agent", async () => {
    const ctx = makeCtx({ actor: { type: "unknown" } });
    const result: any = await handler(makeReq(), null, ctx);
    expect(result.status).toBe(401);
  });

  it("returns 401 when ownerId is missing", async () => {
    const ctx = makeCtx({ ownerId: null });
    const result: any = await handler(makeReq(), null, ctx);
    expect(result.status).toBe(401);
  });

  it("returns 400 when ownerId is not a UUID", async () => {
    const ctx = makeCtx({ ownerId: "not-a-uuid" });
    const result: any = await handler(makeReq(), null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  it("returns 400 for invalid status", async () => {
    const result: any = await handler(makeReq({ status: "INVALID" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toContain("status");
  });

  it("returns 400 for non-integer limit", async () => {
    const result: any = await handler(makeReq({ limit: "abc" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("limit");
  });

  it("returns 400 for limit out of range", async () => {
    const result: any = await handler(makeReq({ limit: "200" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("limit");
  });

  it("returns 400 for invalid cursor", async () => {
    const result: any = await handler(makeReq({ cursor: "not-valid-base64!!!" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid agent_id", async () => {
    const result: any = await handler(makeReq({ agent_id: "not-a-uuid" }), null, makeCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toContain("agent_id");
  });

  // -----------------------------------------------------------------------
  // Success
  // -----------------------------------------------------------------------
  it("returns 200 with deals and next_cursor", async () => {
    const mockDeals = [
      { deal_id: "deal-1", title: "Deal 1", status: "ACTIVE", temperature: 50, price: 999, currency: "EUR", created_at: "2026-01-01T00:00:00Z", creator_agent_id: agentUuid }
    ];
    listDealsByOwnerMock.mockResolvedValue({ items: mockDeals, nextCursor: "abc123" });

    const result: any = await handler(makeReq(), null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.deals).toEqual(mockDeals);
    expect(result.body.data.next_cursor).toBe("abc123");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("passes status filter to service", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    await handler(makeReq({ status: "NEW" }), null, makeCtx());
    expect(listDealsByOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: validUuid, status: "NEW" })
    );
  });

  it("passes agent_id filter to service", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    await handler(makeReq({ agent_id: agentUuid }), null, makeCtx());
    expect(listDealsByOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ creatorAgentId: agentUuid })
    );
  });

  it("passes limit to service", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    await handler(makeReq({ limit: "10" }), null, makeCtx());
    expect(listDealsByOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 })
    );
  });

  it("accepts valid statuses NEW, ACTIVE, EXPIRED", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    for (const status of ["NEW", "ACTIVE", "EXPIRED"]) {
      const result: any = await handler(makeReq({ status }), null, makeCtx());
      expect(result.status).toBe(200);
    }
  });

  it("uppercases status param", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    await handler(makeReq({ status: "active" }), null, makeCtx());
    expect(listDealsByOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" })
    );
  });

  // -----------------------------------------------------------------------
  // Audit
  // -----------------------------------------------------------------------
  it("sets audit event on ctx", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    const ctx = makeCtx();
    await handler(makeReq(), null, ctx);
    expect(ctx.auditEvent).toBe("owner.deals_listed");
    expect(ctx.auditEntityType).toBe("owner");
    expect(ctx.auditEntityId).toBe(validUuid);
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  it("returns 500 when service throws", async () => {
    listDealsByOwnerMock.mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "ERROR" })
    );

    const result: any = await handler(makeReq(), null, makeCtx());
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("ERROR");
  });

  it("works with agent actor type", async () => {
    listDealsByOwnerMock.mockResolvedValue({ items: [], nextCursor: null });

    const ctx = makeCtx({ actor: { type: "agent", id: agentUuid } });
    const result: any = await handler(makeReq(), null, ctx);
    expect(result.status).toBe(200);
  });
});
