import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../../../../server/sse/connections", () => ({
  acquireAgentConnectionSlot: vi.fn(),
  releaseAgentConnectionSlot: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  opsStreamKey: vi.fn(() => "sse:stream:ops:v1"),
  agentStreamKey: vi.fn((agentId) => `sse:stream:agent:v1:${agentId}`),
  getLatestStreamId: vi.fn(),
  readAfter: vi.fn(),
  parseStreamId: vi.fn((id) => {
    if (typeof id !== "string") return null;
    const [msRaw, seqRaw] = id.split("-");
    const ms = Number(msRaw);
    const seq = Number(seqRaw);
    if (!Number.isFinite(ms) || !Number.isFinite(seq)) return null;
    return { ms, seq };
  })
}));

import { handler } from "../../../../pages/api/v1/events/stream";
import { acquireAgentConnectionSlot, releaseAgentConnectionSlot } from "../../../../server/sse/connections";
import { getLatestStreamId, readAfter } from "../../../../server/sse/store";

function createMockReq({ method = "GET", headers = {}, query = {} } = {}) {
  const req: any = new EventEmitter();
  req.method = method;
  req.headers = headers;
  req.query = query;
  return req;
}

function createMockRes() {
  const res: any = new EventEmitter();
  res.writableEnded = false;
  res.statusCode = 200;
  res.headers = {};
  res.chunks = [];
  res.writeHead = (status, headers) => {
    res.statusCode = status;
    Object.assign(res.headers, headers || {});
  };
  res.flushHeaders = vi.fn();
  res.write = (chunk) => {
    res.chunks.push(String(chunk));
    return true;
  };
  res.end = () => {
    res.writableEnded = true;
    res.emit("close");
  };
  return res;
}

const acquireAgentConnectionSlotMock = vi.mocked(acquireAgentConnectionSlot);
const releaseAgentConnectionSlotMock = vi.mocked(releaseAgentConnectionSlot);
const getLatestStreamIdMock = vi.mocked(getLatestStreamId);
const readAfterMock = vi.mocked(readAfter);

const baseCtx: any = {
  requestId: "req-1",
  authError: null,
  actor: { type: "agent", id: "agent-1" },
  agentId: "agent-1",
  ownerId: null
};

describe("GET /v1/events/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 405 for unsupported methods", async () => {
    const req = createMockReq({ method: "POST" });
    const res = createMockRes();
    const result: any = await handler(req, res, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.headers.Allow).toBe("GET");
  });

  it("returns 401 without auth", async () => {
    const req = createMockReq({ headers: { accept: "text/event-stream" } });
    const res = createMockRes();
    const result: any = await handler(req, res, {
      requestId: "req-1",
      authError: null,
      actor: { type: "anonymous", id: null },
      agentId: null,
      ownerId: null
    });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when Accept header is missing", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const result: any = await handler(req, res, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid heartbeat", async () => {
    const req = createMockReq({
      headers: { accept: "text/event-stream" },
      query: { heartbeat: "0" }
    });
    const res = createMockRes();
    const result: any = await handler(req, res, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 when concurrent slot acquisition fails", async () => {
    acquireAgentConnectionSlotMock.mockResolvedValue({ ok: false, reason: "limit_reached" } as any);
    const req = createMockReq({ headers: { accept: "text/event-stream" } });
    const res = createMockRes();
    const result: any = await handler(req, res, { ...baseCtx });
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe("RATE_LIMITED");
  });

  it("writes sse.gap when Last-Event-ID is too old and replay=true", async () => {
    acquireAgentConnectionSlotMock.mockResolvedValue({ ok: true } as any);
    getLatestStreamIdMock.mockResolvedValue(null as any);
    readAfterMock.mockResolvedValue([] as any);

    const req = createMockReq({
      headers: {
        accept: "text/event-stream",
        "last-event-id": "0-0"
      },
      query: { replay: "true" }
    });
    const res = createMockRes();

    const result = await handler(req, res, { ...baseCtx });
    expect(result).toBeNull();

    const joined = (res.chunks as any[]).join("");
    expect(joined).toContain(": ping");
    expect(joined).toContain("event: sse.gap");

    res.end();
    await vi.runOnlyPendingTimersAsync();

    expect(releaseAgentConnectionSlotMock).toHaveBeenCalled();
  });

  it("supports replay cursor via last_event_id query param and can emit as message", async () => {
    acquireAgentConnectionSlotMock.mockResolvedValue({ ok: true } as any);
    getLatestStreamIdMock.mockResolvedValue(null as any);
    readAfterMock.mockResolvedValue([] as any);

    const req = createMockReq({
      headers: { accept: "text/event-stream" },
      query: { replay: "true", last_event_id: "0-0", as_message: "true" }
    });
    const res = createMockRes();

    const result = await handler(req, res, { ...baseCtx });
    expect(result).toBeNull();

    const joined = (res.chunks as any[]).join("");
    expect(joined).toContain("event: message");
    expect(joined).toContain("\"type\":\"sse.gap\"");

    res.end();
    await vi.runOnlyPendingTimersAsync();

    expect(releaseAgentConnectionSlotMock).toHaveBeenCalled();
  });
});
