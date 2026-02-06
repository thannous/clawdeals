import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/deal-votes", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listDealVotes: vi.fn()
  };
});

import { handler } from "../../../../../pages/api/console/deals/[deal_id]/votes";
import { listDealVotes } from "../../../../../server/services/deal-votes";

const dealId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

const listDealVotesMock = vi.mocked(listDealVotes);

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET /api/console/deals/:deal_id/votes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner authentication", async () => {
    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns items", async () => {
    listDealVotesMock.mockResolvedValue({
      items: [{ direction: -1, reason: "Too expensive", weight: "1.0", created_at: "2026-02-05T12:00:00Z" }],
      nextCursor: null
    });

    const req = { method: "GET", query: { deal_id: dealId } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.items[0].direction).toBe("down");
  });
});
