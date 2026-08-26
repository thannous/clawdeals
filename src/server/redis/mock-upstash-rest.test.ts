import { Redis } from "@upstash/redis";
import { afterEach, describe, expect, it } from "vitest";

import { createMockUpstashRedisServer } from "../../../scripts/mock-upstash-redis-rest.mjs";

type MockServer = {
  listen: () => Promise<{ url: string; token: string }>;
  close: () => Promise<void>;
};

const openServers: MockServer[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

async function startMock() {
  const server: MockServer = createMockUpstashRedisServer({
    port: 0,
    token: "synthetic-test-token"
  });
  const address = await server.listen();
  openServers.push(server);
  return {
    address,
    redis: new Redis({ url: address.url, token: address.token, retry: false })
  };
}

describe("local Upstash REST test mock", () => {
  it("refuses to bind outside loopback", () => {
    expect(() =>
      createMockUpstashRedisServer({
        host: "0.0.0.0",
        port: 0,
        token: "synthetic-test-token"
      })
    ).toThrow("may only bind to loopback");
  });

  it("supports SDK auto-pipelines, serialization, NX locks and deletion", async () => {
    const { redis } = await startMock();

    await expect(redis.set("auth:key", { agent_id: "agent-1" }, { ex: 60 })).resolves.toBe("OK");
    await expect(redis.get("auth:key")).resolves.toEqual({ agent_id: "agent-1" });
    await expect(redis.set("lock:key", "first", { nx: true, px: 1_000 })).resolves.toBe("OK");
    await expect(redis.set("lock:key", "second", { nx: true, px: 1_000 })).resolves.toBeNull();
    await expect(redis.del("lock:key")).resolves.toBe(1);
  });

  it("implements the token-bucket EVAL contract used by fail-closed middleware", async () => {
    const { redis } = await startMock();
    const script = `
      local key = KEYS[1]
      local tokens = tonumber((redis.call("HMGET", key, "tokens", "ts"))[1])
      local ts = tonumber(ARGV[3])
      local ttl_ms = tonumber(ARGV[4])
      redis.call("HMSET", key, "tokens", tokens, "ts", ts)
      redis.call("PEXPIRE", key, ttl_ms)
      return {1, tokens, ts}
    `;
    const args = ["2", "0", "1000", "60000"];

    await expect(redis.eval(script, ["rate:key"], args)).resolves.toEqual([1, 1, 1000]);
    await expect(redis.eval(script, ["rate:key"], args)).resolves.toEqual([1, 0, 1000]);
    await expect(redis.eval(script, ["rate:key"], args)).resolves.toEqual([0, 0, 1000]);
  });

  it("supports the stream reads used by SSE polling", async () => {
    const { redis } = await startMock();
    const firstId = await redis.xadd("events", "*", {
      type: "offer.created",
      data: JSON.stringify({ offer_id: "offer-1" })
    });
    const secondId = await redis.xadd("events", "*", {
      type: "offer.accepted",
      data: JSON.stringify({ offer_id: "offer-1" })
    });

    await expect(redis.xrevrange("events", "+", "-", 1)).resolves.toEqual({
      [secondId]: {
        type: "offer.accepted",
        data: { offer_id: "offer-1" }
      }
    });
    await expect(redis.xrange("events", `(${firstId}`, "+", 10)).resolves.toEqual({
      [secondId]: {
        type: "offer.accepted",
        data: { offer_id: "offer-1" }
      }
    });
  });

  it("rejects callers that do not present the synthetic test token", async () => {
    const { address } = await startMock();
    const response = await fetch(`${address.url}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["get", "missing"])
    });
    expect(response.status).toBe(401);
  });
});
