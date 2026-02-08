import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/threads", () => ({
  getThread: vi.fn(),
  listMessages: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/threads/[thread_id]/index";
import { getThread, listMessages } from "../../../../../server/services/threads";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/threads/[thread_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates thread_id as UUID", async () => {
    const req = { method: "GET", query: { thread_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns thread + messages + messages_next_cursor on success", async () => {
    const thread = {
      thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      status: "OPEN"
    };
    vi.mocked(getThread).mockResolvedValue(thread);
    vi.mocked(listMessages).mockResolvedValue({
      items: [{ message_id: "m1", body: "Hello" }],
      nextCursor: "msg-cursor-abc"
    });

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.thread).toEqual(thread);
    expect(result.body.messages).toHaveLength(1);
    expect(result.body.messages[0].message_id).toBe("m1");
    expect(result.body.messages_next_cursor).toBe("msg-cursor-abc");
  });

  it("returns 404 when getThread returns null", async () => {
    vi.mocked(getThread).mockResolvedValue(null);

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("sets ctx.auditEvent = 'thread.viewed'", async () => {
    vi.mocked(getThread).mockResolvedValue({ thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" });
    vi.mocked(listMessages).mockResolvedValue({ items: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("thread.viewed");
  });

  it("handles service error", async () => {
    vi.mocked(getThread).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
