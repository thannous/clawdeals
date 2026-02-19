import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-detail", () => ({
  getDealById: vi.fn()
}));

vi.mock("../../../../../server/services/deal-update", () => ({
  getDealForUpdate: vi.fn(),
  applyDealUpdate: vi.fn()
}));

vi.mock("../../../../../server/services/deal-remove", () => ({
  getDealForRemove: vi.fn(),
  removeDeal: vi.fn()
}));

import { handler } from "../../../../../pages/api/v1/deals/[deal_id]/index";
import { getDealById } from "../../../../../server/services/deal-detail";
import { applyDealUpdate, getDealForUpdate } from "../../../../../server/services/deal-update";
import { getDealForRemove, removeDeal } from "../../../../../server/services/deal-remove";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const getDealByIdMock = vi.mocked(getDealById);
const getDealForUpdateMock = vi.mocked(getDealForUpdate);
const applyDealUpdateMock = vi.mocked(applyDealUpdate);
const getDealForRemoveMock = vi.mocked(getDealForRemove);
const removeDealMock = vi.mocked(removeDeal);

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: "agent-1",
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET /v1/deals/:deal_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates deal_id UUID", async () => {
    const req = { method: "GET", query: { deal_id: "bad" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns deal and masks temperature for NEW", async () => {
    getDealByIdMock.mockResolvedValue({
      deal_id: dealId,
      title: "Test Deal",
      source_url: "https://example.com/deal",
      price: "9.99",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      status: "NEW",
      temperature: 55,
      votes_up: 1,
      votes_down: 2,
      tags: ["gpu"],
      created_at: "2026-02-05T12:00:00Z"
    } as any);

    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deal.viewed");
    expect(result.body.deal.deal_id).toBe(dealId);
    expect(result.body.deal.temperature).toBeNull();
    expect(result.body.deal.price).toBe(9.99);
  });

  it("maps 404 errors from service", async () => {
    getDealByIdMock.mockRejectedValue(Object.assign(new Error("Deal not found"), { status: 404, code: "DEAL_NOT_FOUND" }));

    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("DEAL_NOT_FOUND");
  });
});

describe("PATCH /v1/deals/:deal_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const agentCtx: any = {
    agentId: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1",
    actor: { type: "agent", id: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1" },
    authError: null
  };

  it("requires Idempotency-Key", async () => {
    const ctx: any = { ...agentCtx };
    const req = { method: "PATCH", query: { deal_id: dealId }, body: { price: 10 }, headers: {} };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(ctx.auditEvent).toBe("deal.update_rejected");
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires agent authentication", async () => {
    const req = { method: "PATCH", query: { deal_id: dealId }, body: { price: 10 }, headers: { "idempotency-key": "idem-1" } };
    const result: any = await handler(req, null, { ...agentCtx, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("requires at least one field", async () => {
    getDealForUpdateMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: agentCtx.agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z"
    } as any);

    const req = { method: "PATCH", query: { deal_id: dealId }, body: {}, headers: { "idempotency-key": "idem-1" } };
    const result: any = await handler(req, null, agentCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("forbids editing for non-creator agent", async () => {
    getDealForUpdateMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: "11111111-1111-1111-1111-111111111111",
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z"
    } as any);

    applyDealUpdateMock.mockRejectedValue(Object.assign(new Error("Only the creating agent can edit this deal"), { status: 403, code: "FORBIDDEN" }));

    const req = { method: "PATCH", query: { deal_id: dealId }, body: { price: 9.99 }, headers: { "idempotency-key": "idem-1" } };
    const result: any = await handler(req, null, agentCtx);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("updates deal fields", async () => {
    getDealForUpdateMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: agentCtx.agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z"
    } as any);

    applyDealUpdateMock.mockResolvedValue({
      deal_id: dealId,
      title: "Updated Deal",
      source_url: "https://example.com/deal",
      price: "9.99",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      status: "NEW",
      temperature: 55,
      votes_up: 0,
      votes_down: 0,
      tags: ["gpu"],
      created_at: "2026-02-05T12:00:00Z"
    } as any);

    const ctx: any = { ...agentCtx };
    const req = {
      method: "PATCH",
      query: { deal_id: dealId },
      body: { title: " Updated Deal ", price: 9.99 },
      headers: { "idempotency-key": "idem-1" }
    };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deal.updated");
    expect(result.body.deal.title).toBe("Updated Deal");
    expect(result.body.deal.price).toBe(9.99);
    expect(result.body.deal.temperature).toBeNull();
    expect(applyDealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId,
        agentId: agentCtx.agentId,
        patch: expect.objectContaining({ title: "Updated Deal", price: 9.99 })
      })
    );
  });

  it("updates deal media via full images replacement", async () => {
    getDealForUpdateMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: agentCtx.agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z",
      images: [{ storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" }],
      cover_image_index: 0
    } as any);

    applyDealUpdateMock.mockResolvedValue({
      deal_id: dealId,
      title: "Updated Deal",
      source_url: "https://example.com/deal",
      price: "9.99",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      status: "NEW",
      temperature: 55,
      votes_up: 0,
      votes_down: 0,
      tags: ["gpu"],
      images: [{ storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }],
      cover_image_index: 0,
      created_at: "2026-02-05T12:00:00Z"
    } as any);

    const req = {
      method: "PATCH",
      query: { deal_id: dealId },
      body: { images: [{ storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }] },
      headers: { "idempotency-key": "idem-media-1" }
    };
    const result: any = await handler(req, null, { ...agentCtx });

    expect(result.status).toBe(200);
    expect(applyDealUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          images: [{ storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }],
          cover_image_index: 0
        })
      })
    );
    expect(result.body.deal.images).toEqual([{ storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }]);
    expect(result.body.deal.cover_image_index).toBe(0);
  });

  it("rejects media update when cover_image_index is out of bounds", async () => {
    getDealForUpdateMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: agentCtx.agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z",
      images: [{ storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" }],
      cover_image_index: 0
    } as any);

    const req = {
      method: "PATCH",
      query: { deal_id: dealId },
      body: {
        images: [{ storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }],
        cover_image_index: 4
      },
      headers: { "idempotency-key": "idem-media-invalid-cover" }
    };
    const result: any = await handler(req, null, { ...agentCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(applyDealUpdateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/deals/:deal_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const agentCtx: any = {
    agentId: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1",
    actor: { type: "agent", id: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1" },
    authError: null
  };

  it("requires Idempotency-Key", async () => {
    const ctx: any = { ...agentCtx };
    const req = { method: "DELETE", query: { deal_id: dealId }, headers: {} };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(ctx.auditEvent).toBe("deal.remove_rejected");
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires agent authentication", async () => {
    const req = { method: "DELETE", query: { deal_id: dealId }, headers: { "idempotency-key": "idem-1" } };
    const result: any = await handler(req, null, { ...agentCtx, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("removes deal", async () => {
    getDealForRemoveMock.mockResolvedValue({
      deal_id: dealId,
      creator_agent_id: agentCtx.agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-05T12:00:00Z",
      new_until: "2026-02-05T12:10:00Z"
    } as any);

    removeDealMock.mockResolvedValue({
      deal_id: dealId,
      status: "REMOVED",
      updated_at: "2026-02-05T12:05:00Z"
    } as any);

    const ctx: any = { ...agentCtx };
    const req = { method: "DELETE", query: { deal_id: dealId }, headers: { "idempotency-key": "idem-1" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deal.removed");
    expect(result.body.deal.deal_id).toBe(dealId);
    expect(result.body.deal.status).toBe("REMOVED");
  });
});
