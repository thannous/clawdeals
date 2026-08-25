import crypto from "node:crypto";

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

import {
  createAgentInstallation,
  getInstallationById,
  listActiveInstallationsForOwnerAgent,
  listInstallationsForOwner,
  mapRevokeInstallationRpcError,
  revokeInstallationForOwner
} from "./agent-installations";

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

  it("normalizes installation metadata and stores a one-way fingerprint", async () => {
    const persisted = { installation_id: "installation-1", status: "ACTIVE" };
    const insert = makeQuery({ data: persisted, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient([insert]));
    const now = new Date("2026-07-23T10:00:00.000Z");

    expect(
      await createAgentInstallation({
        ownerId: " owner-1 ",
        agentId: " agent-1 ",
        clientType: ` openclaw-${"x".repeat(50)}`,
        clientVersion: ` 1.2.3-${"x".repeat(50)}`,
        deviceName: ` MacBook ${"x".repeat(100)}`,
        fingerprint: " device-secret ",
        oauthScopes: ["watchlists:read", "deals:read"],
        now
      })
    ).toEqual(persisted);

    const payload = insert.insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      owner_id: "owner-1",
      agent_id: "agent-1",
      status: "ACTIVE",
      fingerprint_hash: crypto.createHash("sha256").update("device-secret").digest("hex"),
      oauth_scopes: ["watchlists:read", "deals:read"],
      created_at: "2026-07-23T10:00:00.000Z",
      last_seen_at: "2026-07-23T10:00:00.000Z",
      revoked_at: null
    });
    expect(payload.client_type).toHaveLength(40);
    expect(payload.client_version).toHaveLength(40);
    expect(payload.device_name).toHaveLength(80);
    expect(JSON.stringify(payload)).not.toContain("device-secret");
  });

  it("scopes owner listing and clamps oversized limits", async () => {
    const list = makeQuery({ data: [{ installation_id: "installation-1" }], error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient([list]));

    const result = await listInstallationsForOwner({
      ownerId: " owner-1 ",
      limit: 500
    });

    expect(result).toHaveLength(1);
    expect(list.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    expect(list.order).toHaveBeenNthCalledWith(
      1,
      "last_seen_at",
      { ascending: false, nullsFirst: false }
    );
    expect(list.limit).toHaveBeenCalledWith(100);
  });

  it("maps not-found and validation RPC errors to stable public errors", () => {
    expect(
      mapRevokeInstallationRpcError({ message: "INSTALLATION_NOT_FOUND" })
    ).toEqual({
      status: 404,
      code: "NOT_FOUND",
      message: "Installation not found"
    });
    expect(
      mapRevokeInstallationRpcError({ message: "VALIDATION_ERROR:owner_id" })
    ).toEqual({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: { field: "OWNER_ID" }
    });
  });

  it("scopes active-installation lookup by both owner and agent", async () => {
    const list = makeQuery({
      data: [{ installation_id: "installation-1", status: "ACTIVE" }],
      error: null
    });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient([list]));

    const result = await listActiveInstallationsForOwnerAgent({
      ownerId: " owner-1 ",
      agentId: " agent-1 ",
      limit: 0
    });

    expect(result).toHaveLength(1);
    expect(list.eq).toHaveBeenNthCalledWith(1, "owner_id", "owner-1");
    expect(list.eq).toHaveBeenNthCalledWith(2, "agent_id", "agent-1");
    expect(list.eq).toHaveBeenNthCalledWith(3, "status", "ACTIVE");
    expect(list.limit).toHaveBeenCalledWith(1);
  });

  it("loads installations by exact normalized id", async () => {
    const lookup = makeQuery({
      data: { installation_id: "installation-1", owner_id: "owner-1" },
      error: null
    });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient([lookup]));

    expect(await getInstallationById(" installation-1 ")).toEqual({
      installation_id: "installation-1",
      owner_id: "owner-1"
    });
    expect(lookup.eq).toHaveBeenCalledWith("installation_id", "installation-1");
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
