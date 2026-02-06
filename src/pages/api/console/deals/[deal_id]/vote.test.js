import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/deals", () => ({
  createDealVote: vi.fn()
}));

import handler from "./vote";
import { createDealVote } from "../../../../../server/services/deals";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

function mockRes() {
  const res = { _status: null, _json: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (body) => { res._json = body; return res; };
  return res;
}

describe("POST /api/console/deals/:deal_id/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", query: { deal_id: dealId }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect(res._json.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("validates deal_id is a UUID", async () => {
    const req = {
      method: "POST",
      query: { deal_id: "bad" },
      body: { direction: "up", reason: "Good deal" }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error.code).toBe("VALIDATION_ERROR");
    expect(res._json.error.message).toContain("UUID");
  });

  it("validates direction", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "sideways", reason: "Good deal" }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires reason", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "" }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error.code).toBe("REASON_REQUIRED");
  });

  it("rejects reason over 240 chars", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "a".repeat(241) }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error.code).toBe("VALIDATION_ERROR");
  });

  it("sanitizes HTML from reason", async () => {
    createDealVote.mockResolvedValue({
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
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(201);
    expect(createDealVote).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.not.stringContaining("<script>")
    }));
    const calledReason = createDealVote.mock.calls[0][0].reason;
    expect(calledReason).toContain("Good deal");
    expect(calledReason).not.toContain("<script>");
  });

  it("redacts URLs from reason", async () => {
    createDealVote.mockResolvedValue({
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
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(201);
    const calledReason = createDealVote.mock.calls[0][0].reason;
    expect(calledReason).toContain("[redacted]");
    expect(calledReason).not.toContain("https://example.com");
  });

  it("creates vote with hardcoded agent and weight", async () => {
    createDealVote.mockResolvedValue({
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
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(201);
    expect(createDealVote).toHaveBeenCalledWith({
      dealId,
      agentId: "00000000-0000-4000-a000-000000000001",
      direction: 1,
      reason: "Great deal",
      weight: 1.0
    });
    expect(res._json.vote.deal_id).toBe(dealId);
    expect(res._json.vote.weight).toBe(1);
    expect(res._json.deal.temperature).toBe(72);
    expect(res._json.deal.votes_up).toBe(6);
  });

  it("maps direction down to -1", async () => {
    createDealVote.mockResolvedValue({
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
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(201);
    expect(createDealVote).toHaveBeenCalledWith(expect.objectContaining({
      direction: -1
    }));
  });

  it("masks temperature for NEW deals in response", async () => {
    createDealVote.mockResolvedValue({
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
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(201);
    expect(res._json.deal.temperature).toBeNull();
  });

  it("returns 409 for ALREADY_VOTED", async () => {
    createDealVote.mockRejectedValue(
      Object.assign(new Error("Already voted on this deal"), { status: 409, code: "ALREADY_VOTED" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Duplicate vote" }
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.error.code).toBe("ALREADY_VOTED");
  });

  it("returns 404 for DEAL_NOT_FOUND", async () => {
    createDealVote.mockRejectedValue(
      Object.assign(new Error("Deal not found"), { status: 404, code: "DEAL_NOT_FOUND" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "up", reason: "Missing deal" }
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(404);
    expect(res._json.error.code).toBe("DEAL_NOT_FOUND");
  });

  it("returns 409 for DEAL_EXPIRED", async () => {
    createDealVote.mockRejectedValue(
      Object.assign(new Error("Deal is expired"), { status: 409, code: "DEAL_EXPIRED" })
    );

    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: { direction: "down", reason: "Expired deal" }
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.error.code).toBe("DEAL_EXPIRED");
  });

  it("handles missing body gracefully", async () => {
    const req = {
      method: "POST",
      query: { deal_id: dealId },
      body: undefined
    };
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error.code).toBe("VALIDATION_ERROR");
  });
});
