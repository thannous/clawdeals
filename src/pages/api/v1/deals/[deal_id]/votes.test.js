import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-votes", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listDealVotes: vi.fn()
  };
});

import { handler } from "./votes";
import { encodeDealVotesCursor, listDealVotes } from "../../../../../server/services/deal-votes";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const baseCtx = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("GET /v1/deals/:deal_id/votes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates direction", async () => {
    const req = { method: "GET", query: { deal_id: dealId, direction: "sideways" } };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for malformed cursor", async () => {
    const req = { method: "GET", query: { deal_id: dealId, cursor: "bad-cursor" } };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects cursor with mismatched direction", async () => {
    const cursor = encodeDealVotesCursor({
      deal_id: dealId,
      direction: "up",
      created_at: "2026-02-05T12:00:00Z",
      deal_vote_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
    });

    const req = { method: "GET", query: { deal_id: dealId, direction: "down", cursor } };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("direction");
  });

  it("returns items + next_cursor", async () => {
    listDealVotes.mockResolvedValue({
      items: [
        {
          direction: 1,
          reason: "Great price",
          weight: "0.72",
          created_at: "2026-02-05T12:03:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { deal_id: dealId, direction: "up", limit: "50" } };
    const result = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deal.votes_listed");
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].direction).toBe("up");
    expect(result.body.items[0].weight).toBe(0.72);
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("maps errors from service", async () => {
    listDealVotes.mockRejectedValue(Object.assign(new Error("Deal not found"), { status: 404, code: "DEAL_NOT_FOUND" }));

    const req = { method: "GET", query: { deal_id: dealId } };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("DEAL_NOT_FOUND");
  });
});

