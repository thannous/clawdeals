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

  it("fails open when redis client initialization throws", async () => {
    const initError = new Error("invalid redis url");
    const onError = vi.fn();
    createUpstashRedis.mockImplementation(() => {
      throw initError;
    });

    const result = await rateLimitMiddleware(request, {
      routeGroup: "channels.telegram.webhook",
      channelId: "telegram:hash-user",
      env: {
        UPSTASH_REDIS_REST_URL: "not-a-url",
        UPSTASH_REDIS_REST_TOKEN: "custom-token"
      },
      onError
    });

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(initError);
    expect(consumeTokenBucket).not.toHaveBeenCalled();
  });

  it("throws when redis client initialization fails and failOpen is false", async () => {
    const initError = new Error("invalid redis url");
    createUpstashRedis.mockImplementation(() => {
      throw initError;
    });

    await expect(
      rateLimitMiddleware(request, {
        routeGroup: "channels.telegram.webhook",
        channelId: "telegram:hash-user",
        env: {
          UPSTASH_REDIS_REST_URL: "not-a-url",
          UPSTASH_REDIS_REST_TOKEN: "custom-token"
        },
        failOpen: false
      })
    ).rejects.toThrow("invalid redis url");
    expect(consumeTokenBucket).not.toHaveBeenCalled();
  });

  it("fails open when redis config is unavailable", async () => {
    resolveUpstashConfig.mockReturnValueOnce(null);

    const result = await rateLimitMiddleware(request, {
      routeGroup: "channels.telegram.webhook",
      channelId: "telegram:hash-user",
      env: {},
      ip: "127.0.0.1"
    });

    expect(result).toBeNull();
    expect(consumeTokenBucket).not.toHaveBeenCalled();
  });

  it("throws when redis config is unavailable and failOpen is false", async () => {
    resolveUpstashConfig.mockReturnValueOnce(null);

    await expect(
      rateLimitMiddleware(request, {
        routeGroup: "channels.telegram.webhook",
        channelId: "telegram:hash-user",
        env: {},
        ip: "127.0.0.1",
        failOpen: false
      })
    ).rejects.toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
      status: 503
    });
    expect(consumeTokenBucket).not.toHaveBeenCalled();
  });
});
