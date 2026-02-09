import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
const mockRedis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  eval: vi.fn(async (_lua: string, keys: string[]) => {
    const key = keys?.[0];
    if (!key) return null;
    const raw = store.get(key) ?? null;
    if (raw) store.delete(key);
    return raw;
  }),
  set: vi.fn(async (key: string, value: string, opts: any) => {
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

  it("creates confirmation (NX) and consumes once", async () => {
    const created = await createConfirmation({
      channelIdentityId: "cid-1",
      action: "approve",
      targetId: "approval-1",
      payload: { approvalId: "approval-1" },
      ttlSeconds: 600
    });
    expect(created.ok).toBe(true);

    const peek = await getConfirmation({ channelIdentityId: "cid-1", action: "approve", targetId: "approval-1" });
    expect(peek).toEqual({ approvalId: "approval-1" });

    // Isolate consumeConfirmation behavior from the peek above.
    mockRedis.get.mockClear();
    mockRedis.del.mockClear();
    mockRedis.eval.mockClear();

    const consumed = await consumeConfirmation({ channelIdentityId: "cid-1", action: "approve", targetId: "approval-1" });
    expect(consumed).toEqual({ approvalId: "approval-1" });
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(mockRedis.get).toHaveBeenCalledTimes(0);
    expect(mockRedis.del).toHaveBeenCalledTimes(0);

    const consumedAgain = await consumeConfirmation({
      channelIdentityId: "cid-1",
      action: "approve",
      targetId: "approval-1"
    });
    expect(consumedAgain).toBeNull();
    expect(mockRedis.eval).toHaveBeenCalledTimes(2);
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
});
