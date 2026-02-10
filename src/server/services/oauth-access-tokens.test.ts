import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, string>();
const sets = new Map<string, Set<string>>();

const mockRedis = {
  get: vi.fn(async (key: string) => kv.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, _options?: any) => {
    kv.set(key, String(value));
    return "OK";
  }),
  del: vi.fn(async (key: string) => {
    kv.delete(key);
    sets.delete(key);
    return 1;
  }),
  sadd: vi.fn(async (key: string, member: string) => {
    const set = sets.get(key) ?? new Set<string>();
    set.add(String(member));
    sets.set(key, set);
    return 1;
  }),
  smembers: vi.fn(async (key: string) => Array.from(sets.get(key) ?? new Set<string>())),
  expire: vi.fn(async (_key: string, _seconds: number) => 1),
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis,
}));

import {
  deleteOauthAccessTokensForInstallation,
  issueOauthAccessToken,
} from "./oauth-access-tokens";

describe("oauth-access-tokens (installation index)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    kv.clear();
    sets.clear();
    process.env.OAUTH_TOKEN_SECRET = "test-secret";
    process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS = "10";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("indexes issued access tokens by installation id", async () => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });

    const indexKey = "auth:oauth:access_installation:v1:install-1";
    expect(mockRedis.sadd).toHaveBeenCalledWith(indexKey, issued.access_token_hash);
    expect(mockRedis.expire).toHaveBeenCalledWith(indexKey, 70);
  });

  it("deletes all indexed access tokens and the index key", async () => {
    const indexKey = "auth:oauth:access_installation:v1:install-1";
    const h1 = "hash-1";
    const h2 = "hash-2";
    sets.set(indexKey, new Set([h1, h2]));
    kv.set(`auth:oauth:access:v1:${h1}`, JSON.stringify({ v: 1 }));
    kv.set(`auth:oauth:access:v1:${h2}`, JSON.stringify({ v: 1 }));

    await deleteOauthAccessTokensForInstallation("install-1");

    expect(kv.has(`auth:oauth:access:v1:${h1}`)).toBe(false);
    expect(kv.has(`auth:oauth:access:v1:${h2}`)).toBe(false);
    expect(sets.has(indexKey)).toBe(false);
  });

  it("is best-effort when Redis smembers fails", async () => {
    mockRedis.smembers.mockRejectedValueOnce(new Error("redis down"));

    await expect(deleteOauthAccessTokensForInstallation("install-1")).resolves.toBeUndefined();
    expect(mockRedis.del).toHaveBeenCalledWith("auth:oauth:access_installation:v1:install-1");
  });
});

