import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/threads", () => ({
  getThread: vi.fn()
}));

vi.mock("../../../../server/services/thread-events", () => ({
  getLatestThreadEventId: vi.fn(),
  readThreadEventsAfter: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/threads/[id]";
import { getThread } from "../../../../server/services/threads";
import { getLatestThreadEventId, readThreadEventsAfter } from "../../../../server/services/thread-events";

const getThreadMock = vi.mocked(getThread);
const getLatestThreadEventIdMock = vi.mocked(getLatestThreadEventId);
const readThreadEventsAfterMock = vi.mocked(readThreadEventsAfter);

const baseCtx: any = {
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

const threadId = "11111111-1111-4111-8111-111111111111";

describe("POST /v1/threads/{thread_id}:watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 405 for unsupported methods", async () => {
    const req: any = { method: "GET", query: { id: `${threadId}:watch` } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.headers.Allow).toBe("POST");
  });

  it("requires agent authentication", async () => {
    const req: any = { method: "POST", query: { id: `${threadId}:watch` }, body: { timeout_ms: 0 } };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates thread_id UUID", async () => {
    const req: any = { method: "POST", query: { id: `not-a-uuid:watch` }, body: { timeout_ms: 0 } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for unknown action", async () => {
    const req: any = { method: "POST", query: { id: `${threadId}:nope` }, body: { timeout_ms: 0 } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when thread not found", async () => {
    getThreadMock.mockResolvedValue(null as any);
    getLatestThreadEventIdMock.mockResolvedValue("0-0" as any);
    readThreadEventsAfterMock.mockResolvedValue([] as any);

    const req: any = { method: "POST", query: { id: `${threadId}:watch` }, body: { timeout_ms: 0 } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when caller is not a party to the thread (BOLA)", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-a",
      seller_agent_id: "agent-b"
    } as any);

    const req: any = { method: "POST", query: { id: `${threadId}:watch` }, body: { timeout_ms: 0 } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("uses latest cursor when cursor is omitted", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);
    getLatestThreadEventIdMock.mockResolvedValue("7-0" as any);
    readThreadEventsAfterMock.mockResolvedValue([] as any);

    const req: any = {
      method: "POST",
      query: { id: `${threadId}:watch` },
      body: { timeout_ms: 0, limit: 10 }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.events).toEqual([]);
    expect(result.body.next_cursor).toBe("7-0");
  });

  it("returns matching events and advances cursor monotonically", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);

    readThreadEventsAfterMock.mockResolvedValue([
      {
        id: "10-0",
        type: "message.sent",
        ts: "2026-02-11T00:00:00Z",
        data: JSON.stringify({ v: 1, type: "message.sent", ts: "2026-02-11T00:00:00Z", payload: { n: 1 } })
      },
      {
        id: "11-0",
        type: "message.sent",
        ts: "2026-02-11T00:00:01Z",
        data: JSON.stringify({ v: 1, type: "message.sent", ts: "2026-02-11T00:00:01Z", payload: { n: 2 } })
      }
    ] as any);

    const req: any = {
      method: "POST",
      query: { id: `${threadId}:watch` },
      body: { cursor: "0-0", timeout_ms: 0, limit: 10, types: ["message.sent"] }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.next_cursor).toBe("11-0");
    expect(result.body.events).toHaveLength(2);
    expect(result.body.events[0].id).toBe("10-0");
    expect(result.body.events[0].type).toBe("message.sent");
  });

  it("advances cursor even when events are filtered out", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);

    readThreadEventsAfterMock.mockImplementation(async (_threadId: any, afterId: any) => {
      if (afterId === "0-0") {
        return [
          {
            id: "1-0",
            type: "offer.created",
            ts: "2026-02-11T00:00:00Z",
            data: JSON.stringify({ v: 1, type: "offer.created", ts: "2026-02-11T00:00:00Z", payload: { n: 1 } })
          }
        ] as any;
      }
      return [] as any;
    });

    const req: any = {
      method: "POST",
      query: { id: `${threadId}:watch` },
      body: { cursor: "0-0", timeout_ms: 0, limit: 10, types: ["message.sent"] }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.events).toEqual([]);
    expect(result.body.next_cursor).toBe("1-0");
  });

  it("returns within timeout even when no events", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);
    getLatestThreadEventIdMock.mockResolvedValue("0-0" as any);
    readThreadEventsAfterMock.mockResolvedValue([] as any);

    const req: any = {
      method: "POST",
      query: { id: `${threadId}:watch` },
      body: { timeout_ms: 1000, limit: 10 }
    };

    const promise = handler(req, null, { ...baseCtx });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runOnlyPendingTimersAsync();
    const result: any = await promise;
    expect(result.status).toBe(200);
    expect(result.body.events).toEqual([]);
  });
});
