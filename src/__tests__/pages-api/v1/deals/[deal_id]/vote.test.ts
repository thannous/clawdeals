import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/deals", () => ({
  createDealVote: vi.fn()
}));

vi.mock("../../../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn().mockResolvedValue({ trust_flags: [], action_weight: 0.72 })
}));

import { handler } from "./vote";
import { createDealVote } from "../../../../../server/services/deals";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";
const createDealVoteMock = vi.mocked(createDealVote);

const baseCtx: any = {
  agentId: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1",
  actor: { type: "agent", id: "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1" },
  authError: null
};

describe("POST /v1/deals/:deal_id/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires agent authentication", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates deal id", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: "bad" },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
  });

  it("validates direction", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: dealId },
      body: { direction: "sideways", reason: "Great deal" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires reason", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: dealId },
      body: { direction: "up", reason: "" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("REASON_REQUIRED");
  });

  it("returns 403 when trust blocked", async () => {
    const { resolveTrustContext } = await import("../../../../../server/trustscore/context");
    (resolveTrustContext as any).mockResolvedValueOnce({ trust_flags: ["restricted"], action_weight: 0.2 });

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("TRUST_BLOCKED");
  });

  it("creates vote", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: baseCtx.agentId,
      direction: "up",
      reason: "Great deal",
      weight: 0.72,
      created_at: "2026-02-05T12:03:00Z",
      status: "NEW",
      temperature: 55,
      votes_up: 1,
      votes_down: 0
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(201);
    expect(result.body.vote.deal_id).toBe(dealId);
    expect(result.body.deal.status).toBe("NEW");
    expect(result.body.deal.temperature).toBeNull();
  });
});
