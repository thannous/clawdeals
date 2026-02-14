import { beforeEach, describe, expect, it, vi } from "vitest";

const Redis = vi.hoisted(() =>
  vi.fn().mockImplementation((config: any) => ({
    eval: vi.fn(),
    __config: config
  }))
);

vi.mock("@upstash/redis", () => ({
  Redis
}));

import { createUpstashRedis, resolveUpstashConfig } from "./upstash";

describe("rate-limit/upstash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when url/token are missing", () => {
    expect(() => createUpstashRedis({})).toThrow("Upstash Redis url/token missing.");
  });

  it("reuses the same client for identical credentials", () => {
    const a = createUpstashRedis({ url: "https://redis-cache-1", token: "token-cache-1" });
    const b = createUpstashRedis({ url: "https://redis-cache-1", token: "token-cache-1" });

    expect(a).toBe(b);
    expect(Redis).toHaveBeenCalledTimes(1);
  });

  it("creates a distinct client for different credentials", () => {
    const a = createUpstashRedis({ url: "https://redis-cache-2", token: "token-cache-2" });
    const b = createUpstashRedis({ url: "https://redis-cache-3", token: "token-cache-3" });

    expect(a).not.toBe(b);
    expect(Redis).toHaveBeenCalledTimes(2);
  });

  it("resolves explicit Upstash env vars", () => {
    const config = resolveUpstashConfig({
      UPSTASH_REDIS_REST_URL: "https://explicit",
      UPSTASH_REDIS_REST_TOKEN: "explicit-token"
    });

    expect(config).toEqual({ url: "https://explicit", token: "explicit-token" });
  });

  it("falls back to KV env vars", () => {
    const config = resolveUpstashConfig({
      KV_REST_API_URL: "https://kv-url",
      KV_REST_API_TOKEN: "kv-token"
    });

    expect(config).toEqual({ url: "https://kv-url", token: "kv-token" });
  });

  it("returns null when no env vars are present", () => {
    const config = resolveUpstashConfig({});
    expect(config).toBeNull();
  });
});
