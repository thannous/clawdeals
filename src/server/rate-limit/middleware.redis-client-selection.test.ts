import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeTokenBucket = vi.hoisted(() =>
  vi.fn(async () => ({
    allowed: true,
    remaining: 1,
    resetSeconds: 1,
    retryAfterSeconds: 0
  }))
);

const createUpstashRedis = vi.hoisted(() => vi.fn());
const resolveUpstashConfig = vi.hoisted(() => vi.fn());
const getRedis = vi.hoisted(() => vi.fn());

vi.mock("./token-bucket", () => ({
  consumeTokenBucket
}));

vi.mock("./upstash", () => ({
  createUpstashRedis,
  resolveUpstashConfig
}));

vi.mock("../redis/upstash", () => ({
  getRedis
}));

import { rateLimitMiddleware } from "./middleware";

describe("rateLimitMiddleware (redis client selection)", () => {
  const request: any = {
    method: "POST",
    url: "http://localhost/api/v1/channels/telegram/webhook",
    headers: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveUpstashConfig.mockImplementation((env?: any) =>
      env
        ? { url: "https://env-upstash", token: "env-token" }
        : { url: "https://global-upstash", token: "global-token" }
    );
  });

  it("uses shared getRedis() when env override is not provided", async () => {
    const sharedRedis = { eval: vi.fn() };
    getRedis.mockReturnValue(sharedRedis);

    const result: any = await rateLimitMiddleware(request, {
      routeGroup: "channels.telegram.webhook",
      channelId: "telegram:hash-user",
      ip: "127.0.0.1",
      nowMs: 0,
      limitMultiplier: 1
    });

    expect(result.status).toBe(200);
    expect(getRedis).toHaveBeenCalledTimes(1);
    expect(createUpstashRedis).not.toHaveBeenCalled();
    const call: any = (consumeTokenBucket as any).mock.calls[0][0];
    expect(call.redis).toBe(sharedRedis);
  });

  it("uses createUpstashRedis() when env override is provided", async () => {
    const envRedis = { eval: vi.fn() };
    createUpstashRedis.mockReturnValue(envRedis);

    const result: any = await rateLimitMiddleware(request, {
      routeGroup: "channels.telegram.webhook",
      channelId: "telegram:hash-user",
      env: {
        UPSTASH_REDIS_REST_URL: "https://custom",
        UPSTASH_REDIS_REST_TOKEN: "custom-token"
      },
      ip: "127.0.0.1",
      nowMs: 0,
      limitMultiplier: 1
    });

    expect(result.status).toBe(200);
    expect(createUpstashRedis).toHaveBeenCalledWith({ url: "https://env-upstash", token: "env-token" });
    expect(getRedis).not.toHaveBeenCalled();
    const call: any = (consumeTokenBucket as any).mock.calls[0][0];
    expect(call.redis).toBe(envRedis);
  });
});
