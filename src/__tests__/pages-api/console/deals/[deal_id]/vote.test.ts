import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/deals", () => ({
  createDealVote: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/deals/[deal_id]/vote";
import { createDealVote } from "../../../../../server/services/deals";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";
const createDealVoteMock = vi.mocked(createDealVote);

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("POST /api/console/deals/:deal_id/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", query: { deal_id: dealId }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("validates deal_id is a UUID", async () => {
    const req = {
      method: "POST",
      query: { deal_id: "bad" },
      body: { direction: "up", reason: "Good deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toContain("UUID");
  });

  it("validates direction", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "sideways", reason: "Good deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires reason", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("REASON_REQUIRED");
  });

  it("rejects reason over 240 chars", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "a".repeat(241) }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sanitizes HTML from reason", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "Good deal",
      weight: 1.0,
      created_at: "2026-02-05T12:00:00Z",
      status: "ACTIVE",
      temperature: 55,
      votes_up: 1,
      votes_down: 0
    });

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: '<script>alert("xss")</script>Good deal' }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(createDealVoteMock).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.not.stringContaining("<script>")
    }));
    const calledReason = createDealVoteMock.mock.calls[0][0].reason;
    expect(calledReason).toContain("Good deal");
    expect(calledReason).not.toContain("<script>");
  });

  it("redacts URLs from reason", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "[redacted] is great",
      weight: 1.0,
      created_at: "2026-02-05T12:00:00Z",
      status: "ACTIVE",
      temperature: 55,
      votes_up: 1,
      votes_down: 0
    });

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "https://example.com is great" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    const calledReason = createDealVoteMock.mock.calls[0][0].reason;
    expect(calledReason).toContain("[redacted]");
    expect(calledReason).not.toContain("https://example.com");
  });

  it("creates vote with hardcoded agent and weight", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "Great deal",
      weight: 1.0,
      created_at: "2026-02-05T12:00:00Z",
      status: "ACTIVE",
      temperature: 72,
      votes_up: 6,
      votes_down: 1
    });

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(createDealVoteMock).toHaveBeenCalledWith({
      dealId,
      agentId: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "Great deal",
      weight: 1.0
    });
    expect(result.body.vote.deal_id).toBe(dealId);
    expect(result.body.vote.weight).toBe(1);
    expect(result.body.deal.temperature).toBe(72);
    expect(result.body.deal.votes_up).toBe(6);
  });

  it("maps direction down to -1", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: "00000000-0000-4000-a000-000000000001",
      direction: -1,
      reason: "Bad deal",
      weight: 1.0,
      created_at: "2026-02-05T12:00:00Z",
      status: "ACTIVE",
      temperature: 30,
      votes_up: 0,
      votes_down: 1
    });

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "down", reason: "Bad deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(createDealVoteMock).toHaveBeenCalledWith(expect.objectContaining({
      direction: -1
    }));
  });

  it("masks temperature for NEW deals in response", async () => {
    createDealVoteMock.mockResolvedValue({
      deal_id: dealId,
      agent_id: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "Great deal",
      weight: 1.0,
      created_at: "2026-02-05T12:00:00Z",
      status: "NEW",
      temperature: 55,
      votes_up: 1,
      votes_down: 0
    });

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Great deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(result.body.deal.temperature).toBeNull();
  });

  it("returns 409 for ALREADY_VOTED", async () => {
    createDealVoteMock.mockRejectedValue(
      Object.assign(new Error("Already voted on this deal"), { status: 409, code: "ALREADY_VOTED" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Duplicate vote" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ALREADY_VOTED");
  });

  it("returns 404 for DEAL_NOT_FOUND", async () => {
    createDealVoteMock.mockRejectedValue(
      Object.assign(new Error("Deal not found"), { status: 404, code: "DEAL_NOT_FOUND" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Missing deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("DEAL_NOT_FOUND");
  });

  it("returns 409 for DEAL_EXPIRED", async () => {
    createDealVoteMock.mockRejectedValue(
      Object.assign(new Error("Deal is expired"), { status: 409, code: "DEAL_EXPIRED" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "down", reason: "Expired deal" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("DEAL_EXPIRED");
  });

  it("handles missing body gracefully", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: undefined
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });
});
