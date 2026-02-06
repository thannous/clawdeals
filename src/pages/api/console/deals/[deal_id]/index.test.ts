import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-detail", () => ({
  getDealById: vi.fn()
}));

import { handler } from "./index";
import { getDealById } from "../../../../../server/services/deal-detail";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET /api/console/deals/:deal_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner authentication", async () => {
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns deal", async () => {
    vi.mocked(getDealById).mockResolvedValue({
      deal_id: dealId,
      title: "Test Deal",
      source_url: "https://example.com/deal",
      price: "9.99",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      status: "ACTIVE",
      temperature: 72,
      votes_up: 1,
      votes_down: 0,
      tags: [],
      created_at: "2026-02-05T12:00:00Z"
    });

    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deal.viewed");
    expect(result.body.deal.temperature).toBe(72);
  });
});
