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

  it("GET validates watchlist_id UUID", async () => {
    const req = { method: "GET", query: { watchlist_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET returns 404 when not found", async () => {
    getWatchlistForAgentMock.mockResolvedValue(null);
    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("GET sets audit outcome BLOCKED when authz is blocked", async () => {
    getWatchlistForAgentMock.mockRejectedValue(
      Object.assign(new Error("Watchlist not found"), {
        status: 404,
        code: "NOT_FOUND",
        isBlocked: true,
        reason: "authz"
      })
    );
    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(404);
    expect(ctx.outcome?.type).toBe("BLOCKED");
  });

  it("PATCH requires Idempotency-Key", async () => {
    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: {},
      body: { active: false }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH requires at least one field", async () => {
    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" },
      body: {}
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH validates active boolean", async () => {
    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" },
      body: { active: "true" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH updates watchlist", async () => {
    updateWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1",
      name: "GPU deals",
      active: false,
      criteria: { query: null, tags: ["gpu"], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T13:00:00Z"
    } as any);

    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" },
      body: { active: false }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.active).toBe(false);
    expect(updateWatchlistForAgent).toHaveBeenCalled();
    expect(enqueueWatchlistBackfill).not.toHaveBeenCalled();
  });

  it("PATCH enqueues best-effort backfill when criteria change", async () => {
    updateWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "11111111-1111-4111-8111-111111111111",
      agent_id: "agent-1",
      name: "Console deals",
      active: true,
      criteria: { query: "console", tags: [], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T13:00:00Z"
    } as any);
    enqueueWatchlistBackfillMock.mockResolvedValue({ ok: true } as any);

    const req = {
      method: "PATCH",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" },
      body: { criteria: { query: "console" } }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(enqueueWatchlistBackfill).toHaveBeenCalledWith({
      watchlistId: "11111111-1111-4111-8111-111111111111"
    });
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

  it("DELETE requires Idempotency-Key", async () => {
    const req = {
      method: "DELETE",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: {}
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE soft deletes watchlist", async () => {
    deleteWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1",
      name: "GPU deals",
      active: false,
      criteria: { query: null, tags: ["gpu"], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T13:00:00Z"
    } as any);

    const req = {
      method: "DELETE",
      query: { watchlist_id: "11111111-1111-4111-8111-111111111111" },
      headers: { "idempotency-key": "abc" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(true);
  });
});
