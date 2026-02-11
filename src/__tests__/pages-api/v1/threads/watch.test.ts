import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/threads", () => ({
  getThread: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  threadStreamKey: vi.fn((threadId) => `sse:stream:thread:v1:${threadId}`),
  getLatestStreamId: vi.fn(),
  readAfter: vi.fn(),
  parseStreamId: vi.fn((id) => {
    if (typeof id !== "string") return null;
    const [msRaw, seqRaw] = id.split("-");
    if (!msRaw || !seqRaw) return null;
    const ms = Number(msRaw);
    const seq = Number(seqRaw);
    if (!Number.isFinite(ms) || !Number.isFinite(seq)) return null;
    return { ms, seq };
  })
}));

import { handler } from "../../../../pages/api/v1/threads/[id]/index";
import { getThread } from "../../../../server/services/threads";
import { getLatestStreamId, readAfter } from "../../../../server/sse/store";

const getThreadMock = vi.mocked(getThread);
const getLatestStreamIdMock = vi.mocked(getLatestStreamId);
const readAfterMock = vi.mocked(readAfter);

const THREAD_ID = "11111111-1111-4111-8111-111111111111";

const baseCtx: any = {
  authError: null,
  actor: { type: "agent", id: "agent-1" },
  agentId: "agent-1",
  ownerId: null
};

describe("POST /v1/threads/{thread_id}:watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 405 for unsupported methods", async () => {
    const req: any = { method: "GET", query: { id: `${THREAD_ID}:watch` }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("requires agent authentication", async () => {
    const req: any = { method: "POST", query: { id: `${THREAD_ID}:watch` }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for unknown action", async () => {
    const req: any = { method: "POST", query: { id: `${THREAD_ID}:nope` }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for malformed action path", async () => {
    const req: any = { method: "POST", query: { id: `${THREAD_ID}:watch:extra` }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("validates thread_id format", async () => {
    const req: any = { method: "POST", query: { id: "not-a-uuid:watch" }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("enforces object-level authorization (thread membership)", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-a",
      seller_agent_id: "agent-b"
    } as any);

    const req: any = { method: "POST", query: { id: `${THREAD_ID}:watch` }, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns events and advances next_cursor monotonically", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);

    readAfterMock.mockResolvedValue([
      {
        id: "1-0",
        type: "message.sent",
        ts: "2026-02-11T00:00:00.000Z",
        data: "{\"v\":1,\"type\":\"message.sent\",\"ts\":\"2026-02-11T00:00:00.000Z\",\"payload\":{\"a\":1}}"
      },
      {
        id: "2-0",
        type: "message.sent",
        ts: "2026-02-11T00:00:01.000Z",
        data: "{\"v\":1,\"type\":\"message.sent\",\"ts\":\"2026-02-11T00:00:01.000Z\",\"payload\":{\"a\":2}}"
      }
    ] as any);

    const req: any = {
      method: "POST",
      query: { id: `${THREAD_ID}:watch` },
      body: { cursor: "0-0", timeout_ms: 0, limit: 50 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.events).toHaveLength(2);
    expect(result.body.next_cursor).toBe("2-0");
  });

  it("returns within timeout even when no events", async () => {
    vi.useFakeTimers();

    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);

    getLatestStreamIdMock.mockResolvedValue("10-0" as any);
    readAfterMock.mockResolvedValue([] as any);

    const req: any = {
      method: "POST",
      query: { id: `${THREAD_ID}:watch` },
      body: { cursor: null, timeout_ms: 500, limit: 50 }
    };

    const promise = handler(req, null, { ...baseCtx });
    await vi.advanceTimersByTimeAsync(500);
    const result: any = await promise;

    expect(result.status).toBe(200);
    expect(result.body.events).toEqual([]);
    expect(result.body.next_cursor).toBe("10-0");
    expect(readAfterMock).toHaveBeenCalled();
  });

  it("advances cursor even when events are filtered out (cursor monotonic)", async () => {
    vi.useFakeTimers();

    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);

    readAfterMock
      .mockResolvedValueOnce([
        {
          id: "5-0",
          type: "other.event",
          ts: "2026-02-11T00:00:00.000Z",
          data: "{\"v\":1,\"type\":\"other.event\",\"ts\":\"2026-02-11T00:00:00.000Z\",\"payload\":{}}"
        }
      ] as any)
      .mockResolvedValue([] as any);

    const req: any = {
      method: "POST",
      query: { id: `${THREAD_ID}:watch` },
      body: { cursor: "0-0", timeout_ms: 10, limit: 50, types: ["message.sent"] }
    };

    const promise = handler(req, null, { ...baseCtx });
    await vi.advanceTimersByTimeAsync(10);
    const result: any = await promise;

    expect(result.status).toBe(200);
    expect(result.body.events).toEqual([]);
    expect(result.body.next_cursor).toBe("5-0");
  });
});
