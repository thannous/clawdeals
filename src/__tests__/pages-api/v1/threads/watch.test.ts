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

  it("does not exceed timeout when an empty poll read is slow", async () => {
    getThreadMock.mockResolvedValue({
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);
    getLatestThreadEventIdMock.mockResolvedValue("0-0" as any);

    let readCount = 0;
    readThreadEventsAfterMock.mockImplementation(async () => {
      readCount += 1;
      if (readCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return [] as any;
    });

    const req: any = {
      method: "POST",
      query: { id: `${threadId}:watch` },
      body: { timeout_ms: 1000, limit: 10 }
    };

    const startedAt = Date.now();
    let resolvedAt = startedAt;
    const promise = handler(req, null, { ...baseCtx }).then((result: any) => {
      resolvedAt = Date.now();
      return result;
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result: any = await promise;

    expect(result.status).toBe(200);
    expect(resolvedAt - startedAt).toBeLessThanOrEqual(1000);
  });
});
