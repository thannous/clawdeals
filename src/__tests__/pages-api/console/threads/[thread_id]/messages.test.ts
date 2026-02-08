import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/threads", () => ({
  listMessages: vi.fn()
}));

vi.mock("../../../../../server/services/messages-cursor", () => ({
  decodeMessagesCursor: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/threads/[thread_id]/messages";
import { listMessages } from "../../../../../server/services/threads";
import { decodeMessagesCursor } from "../../../../../server/services/messages-cursor";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/threads/[thread_id]/messages", () => {
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

  it("returns items and next_cursor", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      items: [{ message_id: "m1", body: "Hello", sender_agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" }],
      nextCursor: "msg-cursor-abc"
    });

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].message_id).toBe("m1");
    expect(result.body.next_cursor).toBe("msg-cursor-abc");
  });

  it("validates limit", async () => {
    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7", limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeMessagesCursor error → 400)", async () => {
    vi.mocked(decodeMessagesCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7", cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets ctx.auditEvent = 'messages.listed'", async () => {
    vi.mocked(listMessages).mockResolvedValue({ items: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("messages.listed");
  });

  it("handles service error", async () => {
    vi.mocked(listMessages).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { thread_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
