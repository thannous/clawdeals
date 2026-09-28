import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-votes", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listDealVotes: vi.fn()
  };
});

import { handler } from "../../../../../pages/api/v1/deals/[deal_id]/votes";
import { encodeDealVotesCursor, listDealVotes } from "../../../../../server/services/deal-votes";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const listDealVotesMock = vi.mocked(listDealVotes);

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("GET /v1/deals/:deal_id/votes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cursor with mismatched direction", async () => {
    const cursor = encodeDealVotesCursor({
      deal_id: dealId,
      direction: "up",
      created_at: "2026-02-05T12:00:00Z",
      deal_vote_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
    });

    const req = { method: "GET", query: { deal_id: dealId, direction: "down", cursor } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("direction");
  });
});
