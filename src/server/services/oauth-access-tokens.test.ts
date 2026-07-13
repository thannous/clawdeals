import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, any>();
const sets = new Map<string, Set<string>>();

const mockRedis = {
  get: vi.fn(async (key: string) => kv.get(key) ?? null),
  set: vi.fn(async (key: string, value: any, _options?: any) => {
    kv.set(key, value);
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

const principalMaybeSingle = vi.fn();
const principalQuery: any = { maybeSingle: principalMaybeSingle };
principalQuery.eq = vi.fn(() => principalQuery);
const principalSelect = vi.fn(() => principalQuery);
const principalFrom = vi.fn(() => ({ select: principalSelect }));

vi.mock("../redis/upstash", () => ({
  getRedis: () => mockRedis,
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({ from: principalFrom }),
}));

import {
  deleteOauthAccessTokensForInstallation,
  authenticateOauthAccessToken,
  getOauthAccessTokenRecordByToken,
  issueOauthAccessToken,
  revokeOauthAccessToken,
} from "./oauth-access-tokens";

describe("oauth-access-tokens (installation index)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    kv.clear();
    sets.clear();
    process.env.OAUTH_TOKEN_SECRET = "test-secret";
    process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS = "10";
    principalMaybeSingle.mockResolvedValue({
      data: {
        installation_id: "install-1",
        owner_id: "owner-1",
        agent_id: "agent-1",
        status: "ACTIVE",
        agents: { id: "agent-1", owner_id: "owner-1", suspended_at: null },
        owners: { owner_id: "owner-1", suspended_at: null },
      },
      error: null,
    });
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

    expect(mockRedis.set).toHaveBeenCalledWith(
      `auth:oauth:access:v1:${issued.access_token_hash}`,
      expect.objectContaining({
        v: 1,
        agent_id: "agent-1",
        owner_id: "owner-1",
        installation_id: "install-1",
      }),
      { ex: 10 }
    );
    const [, payload] = mockRedis.set.mock.calls[0];
    expect(typeof payload).toBe("object");

    const indexKey = "auth:oauth:access_installation:v1:install-1";
    expect(mockRedis.sadd).toHaveBeenCalledWith(indexKey, issued.access_token_hash);
    expect(mockRedis.expire).toHaveBeenCalledWith(indexKey, 70);
  });

  it("fails issuance and removes the undisclosed primary token when installation indexing fails", async () => {
    mockRedis.sadd.mockRejectedValueOnce(new Error("redis index unavailable"));

    await expect(
      issueOauthAccessToken({
        agentId: "agent-1",
        ownerId: "owner-1",
        installationId: "install-1",
        scopes: ["agent:read"],
        now: new Date("2026-02-10T12:00:00Z"),
      })
    ).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });

    expect(mockRedis.del).toHaveBeenCalledWith(expect.stringMatching(/^auth:oauth:access:v1:/));
    expect(Array.from(kv.keys()).filter((key) => key.startsWith("auth:oauth:access:v1:"))).toEqual([]);
  });

  it("fails issuance and removes the primary token when index expiry cannot be established", async () => {
    mockRedis.expire.mockRejectedValueOnce(new Error("redis expire unavailable"));

    await expect(
      issueOauthAccessToken({
        agentId: "agent-1",
        ownerId: "owner-1",
        installationId: "install-1",
        scopes: ["agent:read"],
        now: new Date("2026-02-10T12:00:00Z"),
      })
    ).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });

    expect(Array.from(kv.keys()).filter((key) => key.startsWith("auth:oauth:access:v1:"))).toEqual([]);
  });

  it("rejects an indexed access token immediately after installation revocation", async () => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });
    principalMaybeSingle.mockResolvedValueOnce({
      data: {
        installation_id: "install-1",
        owner_id: "owner-1",
        agent_id: "agent-1",
        status: "REVOKED",
        agents: { id: "agent-1", owner_id: "owner-1", suspended_at: null },
        owners: { owner_id: "owner-1", suspended_at: null },
      },
      error: null,
    });

    await expect(
      authenticateOauthAccessToken(issued.access_token, { now: new Date("2026-02-10T12:00:05Z") })
    ).resolves.toEqual({ ok: false, reason: "revoked" });
    expect(kv.has(`auth:oauth:access:v1:${issued.access_token_hash}`)).toBe(false);
  });

  it("continues to authenticate an unexpired token for an active principal", async () => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });

    await expect(
      authenticateOauthAccessToken(issued.access_token, { now: new Date("2026-02-10T12:00:05Z") })
    ).resolves.toMatchObject({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
    });
  });

  it.each([
    ["agent", "2026-02-10T12:00:01Z", null],
    ["owner", null, "2026-02-10T12:00:01Z"],
  ])("rejects a valid access token after %s suspension", async (_principal, agentSuspendedAt, ownerSuspendedAt) => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });
    principalMaybeSingle.mockResolvedValueOnce({
      data: {
        installation_id: "install-1",
        owner_id: "owner-1",
        agent_id: "agent-1",
        status: "ACTIVE",
        agents: { id: "agent-1", owner_id: "owner-1", suspended_at: agentSuspendedAt },
        owners: { owner_id: "owner-1", suspended_at: ownerSuspendedAt },
      },
      error: null,
    });

    await expect(
      authenticateOauthAccessToken(issued.access_token, { now: new Date("2026-02-10T12:00:05Z") })
    ).resolves.toEqual({ ok: false, reason: "revoked" });
  });

  it("does not issue a new token for a suspended principal", async () => {
    principalMaybeSingle.mockResolvedValueOnce({
      data: {
        installation_id: "install-1",
        owner_id: "owner-1",
        agent_id: "agent-1",
        status: "ACTIVE",
        agents: { id: "agent-1", owner_id: "owner-1", suspended_at: "2026-02-10T12:00:01Z" },
        owners: { owner_id: "owner-1", suspended_at: null },
      },
      error: null,
    });

    await expect(
      issueOauthAccessToken({
        agentId: "agent-1",
        ownerId: "owner-1",
        installationId: "install-1",
        scopes: ["agent:read"],
        now: new Date("2026-02-10T12:00:05Z"),
      })
    ).rejects.toMatchObject({ status: 401, code: "invalid_grant" });
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("fails closed when live OAuth principal validation is unavailable", async () => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });
    principalMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });

    await expect(
      authenticateOauthAccessToken(issued.access_token, { now: new Date("2026-02-10T12:00:05Z") })
    ).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });
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

  it("looks up an access-token record by token value", async () => {
    const now = new Date("2026-02-10T12:00:00Z");
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read", "agent:write"],
      now,
    });

    const found = await getOauthAccessTokenRecordByToken({
      accessToken: issued.access_token,
      now: new Date("2026-02-10T12:00:05Z"),
    });

    expect(found).toEqual({
      accessTokenHash: issued.access_token_hash,
      record: {
        v: 1,
        agent_id: "agent-1",
        owner_id: "owner-1",
        installation_id: "install-1",
        scopes: ["agent:read", "agent:write"],
        issued_at: now.toISOString(),
        expires_at: "2026-02-10T12:00:10.000Z",
      },
    });
  });

  it("drops malformed access-token records during token-value lookup", async () => {
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now: new Date("2026-02-10T12:00:00Z"),
    });

    const key = `auth:oauth:access:v1:${issued.access_token_hash}`;
    kv.set(key, "{broken-json");

    await expect(getOauthAccessTokenRecordByToken({ accessToken: issued.access_token })).resolves.toBeNull();
    expect(kv.has(key)).toBe(false);
  });

  it("revokes an access token by token value", async () => {
    const now = new Date("2026-02-10T12:00:00Z");
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now,
    });

    const key = `auth:oauth:access:v1:${issued.access_token_hash}`;
    const result = await revokeOauthAccessToken({
      accessToken: issued.access_token,
      now: new Date("2026-02-10T12:00:05Z"),
    });

    expect(result).toEqual({
      found: true,
      revoked: true,
      access_token_hash: issued.access_token_hash,
      owner_id: "owner-1",
      agent_id: "agent-1",
      installation_id: "install-1",
    });
    expect(kv.has(key)).toBe(false);
  });

  it("returns not found for unknown access token value", async () => {
    const result = await revokeOauthAccessToken({ accessToken: "cd_at_unknown" });

    expect(result).toEqual({
      found: false,
      revoked: false,
      access_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      owner_id: null,
      agent_id: null,
      installation_id: null,
    });
  });

  it("fails when access-token revoke delete fails", async () => {
    const now = new Date("2026-02-10T12:00:00Z");
    const issued = await issueOauthAccessToken({
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "install-1",
      scopes: ["agent:read"],
      now,
    });
    const key = `auth:oauth:access:v1:${issued.access_token_hash}`;
    mockRedis.del.mockRejectedValueOnce(new Error("redis down"));

    await expect(
      revokeOauthAccessToken({
        accessToken: issued.access_token,
        now: new Date("2026-02-10T12:00:05Z"),
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "AUTH_UNAVAILABLE",
    });
    expect(kv.has(key)).toBe(true);
  });
});
