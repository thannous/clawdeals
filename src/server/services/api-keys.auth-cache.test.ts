import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, string>();
const mockRedis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  })
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

vi.mock("../utils/api-keys", async () => {
  const actual: any = await vi.importActual("../utils/api-keys");
  return {
    ...actual,
    verifyApiKeySecret: vi.fn(async () => true)
  };
});

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

const eq2ForRevoke = vi.fn(async () => ({ data: null, error: null }));
const eq1ForRevoke = vi.fn(() => ({ eq: eq2ForRevoke }));
const update = vi.fn(() => ({ eq: eq1ForRevoke }));

const from = vi.fn(() => ({ select, update }));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({
    from
  })
}));

import { authenticateApiKey } from "./api-keys";

const API_KEY = "cd_live_abcdefgh.secret";

describe("authenticateApiKey (auth cache)", () => {
  let warnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    maybeSingle.mockResolvedValue({
      data: {
        api_key_id: "key-1",
        agent_id: "agent-1",
        key_hash: "hash",
        key_state: "ACTIVE",
        grace_expires_at: null,
        revoked_at: null,
        agents: { owner_id: "owner-1" }
      },
      error: null
    });
  });

  afterEach(() => {
    if (warnSpy) warnSpy.mockRestore();
  });

  it("caches the DB lookup by key prefix (second call skips Supabase)", async () => {
    const first: any = await authenticateApiKey(API_KEY);
    expect(first.ok).toBe(true);
    expect(first.agentId).toBe("agent-1");
    expect(first.ownerId).toBe("owner-1");
    expect(first.apiKeyId).toBe("key-1");

    const second: any = await authenticateApiKey(API_KEY);
    expect(second.ok).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("treats Redis read errors as a cache miss (auth still succeeds via DB)", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("redis down"));

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(true);
    expect(result.agentId).toBe("agent-1");
    expect(from).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("treats Redis write errors as non-fatal (auth still succeeds, but doesn't cache)", async () => {
    mockRedis.set.mockRejectedValueOnce(new Error("redis down"));

    const first: any = await authenticateApiKey(API_KEY);
    expect(first.ok).toBe(true);

    const second: any = await authenticateApiKey(API_KEY);
    expect(second.ok).toBe(true);

    // Cache write failed, so we had to hit Supabase twice.
    expect(from).toHaveBeenCalledTimes(2);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("treats Redis delete errors as non-fatal (revoked cached record still returns revoked)", async () => {
    // Seed a revoked cache entry.
    store.set(
      "auth:api_key_prefix:abcdefgh",
      JSON.stringify({
        api_key_id: "key-1",
        agent_id: "agent-1",
        owner_id: "owner-1",
        key_hash: "hash",
        key_state: "REVOKED",
        grace_expires_at: null,
        revoked_at: "2026-02-09T10:00:00.000Z"
      })
    );
    mockRedis.del.mockRejectedValueOnce(new Error("redis down"));

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("revoked");
    expect(from).not.toHaveBeenCalled();
  });

  it("purges cached revoked keys", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        api_key_id: "key-1",
        agent_id: "agent-1",
        key_hash: "hash",
        key_state: "REVOKED",
        grace_expires_at: null,
        revoked_at: "2026-02-09T10:00:00.000Z",
        agents: { owner_id: "owner-1" }
      },
      error: null
    });

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("revoked");
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("accepts cached GRACE keys before expiry", async () => {
    store.set(
      "auth:api_key_prefix:abcdefgh",
      JSON.stringify({
        api_key_id: "key-1",
        agent_id: "agent-1",
        owner_id: "owner-1",
        key_hash: "hash",
        key_state: "GRACE",
        grace_expires_at: new Date(Date.now() + 60_000).toISOString(),
        revoked_at: null
      })
    );

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(true);
    expect(result.keyState).toBe("GRACE");
    expect(result.agentId).toBe("agent-1");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects cached GRACE keys after expiry and revokes the record", async () => {
    store.set(
      "auth:api_key_prefix:abcdefgh",
      JSON.stringify({
        api_key_id: "key-1",
        agent_id: "agent-1",
        owner_id: "owner-1",
        key_hash: "hash",
        key_state: "GRACE",
        grace_expires_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: null
      })
    );

    const result: any = await authenticateApiKey(API_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
    expect(update).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).toHaveBeenCalledWith("auth:api_key_prefix:abcdefgh");
  });
});
