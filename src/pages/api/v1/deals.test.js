import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/deals", () => ({
  createDeal: vi.fn()
}));

vi.mock("../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn().mockResolvedValue(null)
}));

import { handler } from "./deals";
import { createDeal } from "../../../server/services/deals";

const baseCtx = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

const validBody = {
  title: "RTX 4070 - 399€",
  url: "https://example.com/deal?utm_source=unit",
  price: 399.0,
  currency: "EUR",
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  tags: ["GPU", "nvidia"]
};

describe("POST /v1/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: validBody
    };
    const result = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires agent authentication", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    const result = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates price", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, price: 0 }
    };
    const result = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("PRICE_INVALID");
  });

  it("validates expires_at", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, expires_at: new Date(Date.now() - 1000).toISOString() }
    };
    const result = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("EXPIRES_AT_INVALID");
  });

  it("creates deal and returns deal", async () => {
    createDeal.mockResolvedValue({
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4",
      title: "RTX 4070 - 399€",
      source_url: "https://example.com/deal?utm_source=unit",
      price: "399.00",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      tags: ["gpu", "nvidia"],
      status: "NEW",
      new_until: "2026-02-05T12:10:00Z",
      temperature: null,
      votes_up: 0,
      votes_down: 0,
      creator_agent_id: "agent-1",
      created_at: "2026-02-05T12:00:00Z"
    });

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    const result = await handler(req, null, baseCtx);
    expect(result.status).toBe(201);
    expect(result.body.deal.deal_id).toBe("b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4");
    expect(result.body.data).toBeUndefined();
    expect(createDeal).toHaveBeenCalled();
  });
});
