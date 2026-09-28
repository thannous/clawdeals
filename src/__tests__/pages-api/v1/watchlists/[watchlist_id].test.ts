import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/watchlists", () => ({
  getWatchlistForAgent: vi.fn(),
  updateWatchlistForAgent: vi.fn(),
  deleteWatchlistForAgent: vi.fn()
}));

vi.mock("../../../../server/services/watchlist-backfill-queue", () => ({
  enqueueWatchlistBackfill: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/watchlists/[watchlist_id]";
import { deleteWatchlistForAgent, getWatchlistForAgent, updateWatchlistForAgent } from "../../../../server/services/watchlists";
import { enqueueWatchlistBackfill } from "../../../../server/services/watchlist-backfill-queue";

const getWatchlistForAgentMock = vi.mocked(getWatchlistForAgent);
const updateWatchlistForAgentMock = vi.mocked(updateWatchlistForAgent);
const deleteWatchlistForAgentMock = vi.mocked(deleteWatchlistForAgent);
const enqueueWatchlistBackfillMock = vi.mocked(enqueueWatchlistBackfill);

const baseCtx: any = {
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("/v1/watchlists/:watchlist_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH still succeeds when best-effort backfill enqueue fails", async () => {
    updateWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "11111111-1111-4111-8111-111111111111",
      agent_id: "agent-1",
      name: "Console deals",
      active: true,
      criteria: { query: "console", tags: [], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T13:00:00Z"
    } as any);
    enqueueWatchlistBackfillMock.mockRejectedValue(new Error("queue down"));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" },
      body: { active: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      "watchlist.backfill_enqueue_failed",
      expect.objectContaining({ watchlist_id: "11111111-1111-4111-8111-111111111111" })
    );
    infoSpy.mockRestore();
  });
});
