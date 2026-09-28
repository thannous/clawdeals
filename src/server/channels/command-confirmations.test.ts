import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, any>();
const mockRedis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  eval: vi.fn(async (_lua: string, keys: string[]) => {
    const key = keys?.[0];
    if (!key) return null;
    const raw = store.get(key) ?? null;
    if (raw) store.delete(key);
    return raw;
  }),
  set: vi.fn(async (key: string, value: any, opts: any) => {
    if (opts?.nx && store.has(key)) return null;
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (key: string) => {
    const existed = store.has(key);
    store.delete(key);
    return existed ? 1 : 0;
  })
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

import { createConfirmation, consumeConfirmation, getConfirmation } from "./command-confirmations";

describe("command confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it("does not overwrite existing confirmation when NX is used", async () => {
    await createConfirmation({
      channelIdentityId: "cid-1",
      action: "deny",
      targetId: "approval-1",
      payload: { reason: "first" },
      ttlSeconds: 600
    });

    const created = await createConfirmation({
      channelIdentityId: "cid-1",
      action: "deny",
      targetId: "approval-1",
      payload: { reason: "second" },
      ttlSeconds: 600
    });

    expect(created.ok).toBe(false);
    const peek = await getConfirmation({ channelIdentityId: "cid-1", action: "deny", targetId: "approval-1" });
    expect(peek).toEqual({ reason: "first" });
  });

  it("consumes atomically under concurrency", async () => {
    await createConfirmation({
      channelIdentityId: "cid-1",
      action: "approve",
      targetId: "approval-2",
      payload: { approvalId: "approval-2" },
      ttlSeconds: 600
    });

    mockRedis.get.mockClear();
    mockRedis.del.mockClear();
    mockRedis.eval.mockClear();

    const [a, b] = await Promise.all([
      consumeConfirmation({ channelIdentityId: "cid-1", action: "approve", targetId: "approval-2" }),
      consumeConfirmation({ channelIdentityId: "cid-1", action: "approve", targetId: "approval-2" })
    ]);

    const nonNull = [a, b].filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]).toEqual({ approvalId: "approval-2" });

    expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    expect(mockRedis.get).toHaveBeenCalledTimes(0);
    expect(mockRedis.del).toHaveBeenCalledTimes(0);
  });
});
