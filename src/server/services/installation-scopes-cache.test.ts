import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => "OK"),
  del: vi.fn(async () => 1)
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

import { getCachedInstallationOauthScopes, setCachedInstallationOauthScopes } from "./installation-scopes-cache";

describe("getCachedInstallationOauthScopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INSTALLATION_SCOPES_CACHE_TTL_SECONDS = "60";
  });

  it("returns cached scopes when Upstash already deserializes JSON", async () => {
    mockRedis.get.mockResolvedValueOnce({ v: 1, oauth_scopes: ["a", "b"] });

    const scopes = await getCachedInstallationOauthScopes("inst-1");
    expect(scopes).toEqual(["a", "b"]);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("returns cached scopes when value is a JSON string", async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ v: 1, oauth_scopes: ["x"] }));

    const scopes = await getCachedInstallationOauthScopes("inst-2");
    expect(scopes).toEqual(["x"]);
  });

  it("deletes and returns null when cached value is malformed", async () => {
    mockRedis.get.mockResolvedValueOnce({ v: 2, oauth_scopes: ["x"] });

    const scopes = await getCachedInstallationOauthScopes("inst-3");
    expect(scopes).toBeNull();
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });

  it("stores native object payload without manual JSON serialization", async () => {
    await setCachedInstallationOauthScopes("inst-4", ["read", "write"], 90);

    expect(mockRedis.set).toHaveBeenCalledWith(
      "auth:installation:oauth_scopes:v1:inst-4",
      { v: 1, oauth_scopes: ["read", "write"] },
      { ex: 90 }
    );
    const call: any = mockRedis.set.mock.calls[0];
    const payload = call[1];
    expect(typeof payload).toBe("object");
  });
});
