import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(async () => null),
  del: vi.fn(async () => 1)
};

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis
}));

import { getCachedInstallationOauthScopes } from "./installation-scopes-cache";

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
});
