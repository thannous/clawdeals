import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-detail", () => ({
  getDealById: vi.fn()
}));

import { handler } from "../../../../../pages/api/v1/deals/[deal_id]/index";
import { getDealById } from "../../../../../server/services/deal-detail";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const getDealByIdMock = vi.mocked(getDealById);

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
