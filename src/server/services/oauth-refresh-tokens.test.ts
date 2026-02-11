import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseServiceClientMock } = vi.hoisted(() => ({
  getSupabaseServiceClientMock: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: getSupabaseServiceClientMock
}));

import { rotateRefreshToken } from "./oauth-refresh-tokens";

function createLookupBuilder(result: any) {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

function createInsertBuilder(result: any) {
  const builder: any = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  return builder;
}

function createRevokeBuilder(result: any) {
  const builder: any = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.gt = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

function createDeleteBuilder(result: any) {
  const builder: any = {};
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(async () => result);
  return builder;
}

describe("oauth-refresh-tokens.rotateRefreshToken", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OAUTH_TOKEN_SECRET = "test-oauth-token-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed and cleans up inserted token when old-token revoke fails", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const existingTokenRow = {
      token_id: "old-token-id",
      token_hash: "old-token-hash",
      owner_id: "owner-1",
      agent_id: "agent-1",
      installation_id: "inst-1",
      scopes: ["agent:read"],
      revoked_at: null,
      expires_at: new Date(now.getTime() + 60_000).toISOString()
    };
    const insertedTokenRow = {
      token_id: "new-token-id",
      token_hash: "new-token-hash",
      expires_at: new Date(now.getTime() + 60_000).toISOString()
    };

    const lookupBuilder = createLookupBuilder({ data: existingTokenRow, error: null });
    const insertBuilder = createInsertBuilder({ data: insertedTokenRow, error: null });
    const revokeBuilder = createRevokeBuilder({
      data: null,
      error: { code: "PGRST500", message: "db down" }
    });
    const cleanupBuilder = createDeleteBuilder({ data: null, error: null });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(lookupBuilder)
      .mockReturnValueOnce(insertBuilder)
      .mockReturnValueOnce(revokeBuilder)
      .mockReturnValueOnce(cleanupBuilder);

    getSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    await expect(rotateRefreshToken({ refreshToken: "cd_rt_old", now })).rejects.toMatchObject({
      status: 503,
      code: "AUTH_UNAVAILABLE"
    });

    expect(cleanupBuilder.delete).toHaveBeenCalledTimes(1);
    expect(cleanupBuilder.eq).toHaveBeenCalledWith("token_id", "new-token-id");
    expect(fromMock).toHaveBeenCalledTimes(4);
  });

  it("returns a rotated token when revocation succeeds", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const existingTokenRow = {
      token_id: "old-token-id",
      token_hash: "old-token-hash",
      owner_id: "owner-1",
      agent_id: "agent-1",
      installation_id: "inst-1",
      scopes: ["agent:read", "agent:write"],
      revoked_at: null,
      expires_at: new Date(now.getTime() + 60_000).toISOString()
    };
    const insertedTokenRow = {
      token_id: "new-token-id",
      token_hash: "new-token-hash",
      expires_at: new Date(now.getTime() + 60_000).toISOString()
    };

    const lookupBuilder = createLookupBuilder({ data: existingTokenRow, error: null });
    const insertBuilder = createInsertBuilder({ data: insertedTokenRow, error: null });
    const revokeBuilder = createRevokeBuilder({
      data: { token_id: existingTokenRow.token_id },
      error: null
    });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(lookupBuilder)
      .mockReturnValueOnce(insertBuilder)
      .mockReturnValueOnce(revokeBuilder);

    getSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    const rotated = await rotateRefreshToken({ refreshToken: "cd_rt_old", now });

    expect(rotated.old_token_id).toBe("old-token-id");
    expect(rotated.new_token_id).toBe("new-token-id");
    expect(rotated.owner_id).toBe("owner-1");
    expect(rotated.agent_id).toBe("agent-1");
    expect(rotated.installation_id).toBe("inst-1");
    expect(rotated.scopes).toEqual(["agent:read", "agent:write"]);
    expect(rotated.new_refresh_token).toMatch(/^cd_rt_/);
    expect(fromMock).toHaveBeenCalledTimes(3);
  });
});
