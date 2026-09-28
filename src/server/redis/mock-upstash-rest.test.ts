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
