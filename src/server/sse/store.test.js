import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../redis/upstash.js", () => ({
  getRedis: vi.fn()
}));

import { getRedis } from "../redis/upstash.js";
import { readAfter } from "./store.js";

describe("sse/store readAfter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves string payloads", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue({
        "1-0": {
          type: "deal.created",
          ts: "2026-01-01T00:00:00.000Z",
          data: "{\"v\":1,\"payload\":{\"a\":1}}"
        }
      })
    };
    getRedis.mockReturnValue(redis);

    const entries = await readAfter("sse:stream:test", "0-0", 50);
    expect(entries[0].data).toBe("{\"v\":1,\"payload\":{\"a\":1}}");
  });

  it("stringifies JSON-deserialized payloads (Upstash automaticDeserialization)", async () => {
    const parsed = { v: 1, actor: { type: "system", id: "clawdeals" }, payload: { a: 1 } };
    const redis = {
      xrange: vi.fn().mockResolvedValue({
        "1-0": {
          type: "deal.created",
          ts: "2026-01-01T00:00:00.000Z",
          data: parsed
        }
      })
    };
    getRedis.mockReturnValue(redis);

    const entries = await readAfter("sse:stream:test", "0-0", 50);
    expect(entries[0].data).toBe(JSON.stringify(parsed));
  });

  it("returns null when data is missing", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue({
        "1-0": {
          type: "deal.created",
          ts: "2026-01-01T00:00:00.000Z"
        }
      })
    };
    getRedis.mockReturnValue(redis);

    const entries = await readAfter("sse:stream:test", "0-0", 50);
    expect(entries[0].data).toBeNull();
  });
});

