
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  mapSupabaseError: vi.fn((error: any) => ({
    message: error?.message || "Database error",
    status: error?.status || 500,
    code: error?.code || "DATABASE_ERROR"
  })),
  deleteCachedApiKeyAuthRecord: vi.fn(),
  deleteOauthAccessTokensForInstallation: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

vi.mock("./supabase-errors", () => ({
  mapSupabaseError: mocks.mapSupabaseError
}));

vi.mock("./api-key-auth-cache", () => ({
  deleteCachedApiKeyAuthRecord: mocks.deleteCachedApiKeyAuthRecord
}));

vi.mock("./oauth-access-tokens", () => ({
  deleteOauthAccessTokensForInstallation: mocks.deleteOauthAccessTokensForInstallation
}));

import { revokeInstallationForOwner } from "./agent-installations";

type QueryResult = { data: any; error: any };

function makeQuery(result: QueryResult) {
  const query: any = {};
  for (const method of ["select", "eq", "order", "limit", "insert"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function makeClient(fromQueries: any[], rpcQuery?: any) {
  return {
    from: vi.fn().mockImplementation(() => {
      const query = fromQueries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    }),
    rpc: vi.fn(() => {
      if (!rpcQuery) throw new Error("Unexpected Supabase RPC");
      return rpcQuery;
    })
  };
}

describe("agent-installations service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes atomically, invalidates unique key prefixes, and removes OAuth access", async () => {
    const before = makeQuery({
      data: [{ key_prefix: "cd_a" }, { key_prefix: "cd_shared" }, { key_prefix: null }],
      error: null
    });
    const after = makeQuery({
      data: [{ key_prefix: "cd_shared" }, { key_prefix: "cd_b" }],
      error: null
    });
    const rpc = makeQuery({
      data: { installation_id: "installation-1", status: "REVOKED" },
      error: null
    });
    const client = makeClient([before, after], rpc);
    mocks.getSupabaseServiceClient.mockReturnValue(client);
    mocks.deleteCachedApiKeyAuthRecord.mockRejectedValueOnce(new Error("cache unavailable"));
    const now = new Date("2026-07-23T10:00:00.000Z");

    const result = await revokeInstallationForOwner({
      ownerId: " owner-1 ",
      installationId: " installation-1 ",
      now
    });

    expect(result.status).toBe("REVOKED");
    expect(client.rpc).toHaveBeenCalledWith("revoke_installation_v1", {
      p_installation_id: "installation-1",
      p_owner_id: "owner-1",
      p_now: "2026-07-23T10:00:00.000Z"
    });
    expect(mocks.deleteCachedApiKeyAuthRecord.mock.calls.map(([prefix]) => prefix)).toEqual([
      "cd_a",
      "cd_shared",
      "cd_b"
    ]);
    expect(mocks.deleteOauthAccessTokensForInstallation).toHaveBeenCalledWith(
      "installation-1"
    );
  });

  it("does not run secondary cleanup when the owner-scoped revoke RPC fails", async () => {
    const before = makeQuery({ data: [{ key_prefix: "cd_a" }], error: null });
    const rpc = makeQuery({
      data: null,
      error: { message: "INSTALLATION_NOT_FOUND" }
    });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient([before], rpc));

    await expect(
      revokeInstallationForOwner({
        ownerId: "owner-1",
        installationId: "installation-1"
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
    expect(mocks.deleteCachedApiKeyAuthRecord).not.toHaveBeenCalled();
    expect(mocks.deleteOauthAccessTokensForInstallation).not.toHaveBeenCalled();
  });
});
