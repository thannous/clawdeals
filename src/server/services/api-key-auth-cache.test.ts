import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(async () => null),
  del: vi.fn(async () => 1)
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

import { getCachedApiKeyAuthRecord } from "./api-key-auth-cache";

describe("getCachedApiKeyAuthRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY_LOOKUP_CACHE_TTL_SECONDS = "60";
  });

  it("returns a cached record when Upstash already deserializes JSON", async () => {
    mockRedis.get.mockResolvedValueOnce({
      api_key_id: "key-1",
      agent_id: "agent-1",
      owner_id: null,
      installation_id: null,
      key_hash: "hash",
      key_state: "ACTIVE",
      grace_expires_at: null,
      revoked_at: null,
      suspended_at: null
    });

    const record = await getCachedApiKeyAuthRecord("abcd");
    expect(record?.api_key_id).toBe("key-1");
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("returns a cached record when value is a JSON string", async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        api_key_id: "key-2",
        agent_id: "agent-2",
        owner_id: "owner-2",
        installation_id: null,
        key_hash: "hash",
        key_state: "ACTIVE",
        grace_expires_at: null,
        revoked_at: null,
        suspended_at: null
      })
    );

    const record = await getCachedApiKeyAuthRecord("efgh");
    expect(record?.api_key_id).toBe("key-2");
    expect(record?.owner_id).toBe("owner-2");
  });

  it("deletes and returns null when cached value is malformed", async () => {
    mockRedis.get.mockResolvedValueOnce({ ok: true });

    const record = await getCachedApiKeyAuthRecord("ijkl");
    expect(record).toBeNull();
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });
});
