import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/agents", () => ({ getAgentIdByOwnerId: vi.fn() }));
vi.mock("../../../../server/services/deals", () => ({ createDealVote: vi.fn() }));

import { handler } from "../../../../pages/api/v1/owner/deals/[deal_id]/vote";
import { getAgentIdByOwnerId } from "../../../../server/services/agents";
import { createDealVote } from "../../../../server/services/deals";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const dealId = "d2db4d40-8f3f-4d3e-ae1c-64c88440c9ef";

function request(overrides: any = {}) {
  return {
    method: "POST",
    query: { deal_id: dealId },
    headers: { "idempotency-key": "request-1" },
    body: { direction: "up", reason: "Useful verified price drop" },
    ...overrides
  };
}

function context(overrides: any = {}) {
  return { actor: { type: "owner", id: ownerId }, ownerId, ...overrides };
}

describe("POST /api/v1/owner/deals/:id/vote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the owner vote through the owner's connected agent", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue("agent-1");
    vi.mocked(createDealVote).mockResolvedValue({
      deal_id: dealId,
      agent_id: "agent-1",
      direction: "up",
      reason: "Useful verified price drop",
      weight: 1,
      created_at: "2026-09-04T09:00:00.000Z",
      status: "ACTIVE",
      temperature: 62,
      votes_up: 1,
      votes_down: 0
    } as any);

    const ctx = context();
    const result: any = await handler(request(), null, ctx);
    expect(result.status).toBe(201);
    expect(createDealVote).toHaveBeenCalledWith(expect.objectContaining({
      dealId,
      agentId: "agent-1",
      direction: 1,
      weight: 1
    }));
    expect(result.body.data.deal.votes_up).toBe(1);
    expect(ctx.auditEvent).toBe("owner.deal_voted");
  });

  it("requires a connected agent", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue(null);
    const result: any = await handler(request(), null, context());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("AGENT_REQUIRED");
  });

  it("rejects anonymous requests and missing reasons", async () => {
    const unauthorized: any = await handler(request(), null, context({ actor: null, ownerId: null }));
    expect(unauthorized.status).toBe(401);
    const invalid: any = await handler(request({ body: { direction: "down", reason: "" } }), null, context());
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("REASON_REQUIRED");
  });
});
