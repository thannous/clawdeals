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

  it("is best-effort when Redis smembers fails", async () => {
    mockRedis.smembers.mockRejectedValueOnce(new Error("redis down"));

    await expect(deleteOauthAccessTokensForInstallation("install-1")).resolves.toBeUndefined();
    expect(mockRedis.del).toHaveBeenCalledWith("auth:oauth:access_installation:v1:install-1");
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
