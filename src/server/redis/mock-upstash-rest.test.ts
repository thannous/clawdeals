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
  it("checks owned string and stream cleanup without touching another key", async () => {
    const { redis } = await startMock();
    await redis.set("fixture:key", "owned");
    await redis.xadd("fixture:stream", "*", { event: "synthetic" });
    await redis.set("other:key", "retained");
    expect(await redis.exists("fixture:key", "fixture:stream", "missing")).toBe(2);
    await redis.del("fixture:key", "fixture:stream");
    expect(await redis.exists("fixture:key", "fixture:stream")).toBe(0);
    expect(await redis.get("other:key")).toBe("retained");
  });

  it("refuses to bind outside loopback", () => {
    expect(() =>
      createMockUpstashRedisServer({
        host: "0.0.0.0",
        port: 0,
        token: "synthetic-test-token"
      })
    ).toThrow("may only bind to loopback");
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
