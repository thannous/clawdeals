import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  mapSupabaseError: vi.fn((error: any) => ({
    message: error?.message || "Database error",
    status: error?.status || 500,
    code: error?.code || "DATABASE_ERROR"
  }))
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

vi.mock("./supabase-errors", () => ({
  mapSupabaseError: mocks.mapSupabaseError
}));

import {
  claimConnectSession,
  createConnectSession,
  denyConnectSession,
  getConnectSessionByClaimToken,
  getConnectSessionForPoll,
  hashConnectSessionToken
} from "./connect-sessions";

type QueryResult = { data: any; error: any };

function makeQuery(result: QueryResult) {
  const query: any = {};
  for (const method of ["select", "eq", "gt", "insert", "update"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function makeClient(...queries: any[]) {
  return {
    from: vi.fn().mockImplementation(() => {
      const query = queries.shift();
      if (!query) throw new Error("Unexpected Supabase query");
      return query;
    })
  };
}

describe("connect-sessions lifecycle", () => {
  const previousSecret = process.env.CONNECT_SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONNECT_SESSION_SECRET = "connect-test-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.CONNECT_SESSION_SECRET;
    } else {
      process.env.CONNECT_SESSION_SECRET = previousSecret;
    }
  });

  it("persists hashes instead of bearer secrets and normalizes request metadata", async () => {
    const persisted = { session_id: "session-1", status: "PENDING_CLAIM" };
    const insert = makeQuery({ data: persisted, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(insert));
    const now = new Date("2026-07-23T10:00:00.000Z");

    const result = await createConnectSession({
      requestedAgentName: ` Agent ${"x".repeat(100)}`,
      requestedScopes: [" deals:read ", "", null, "deals:write"],
      clientType: ` openclaw-${"x".repeat(50)}`,
      clientVersion: " 1.2.3 ",
      ipTruncated: " 203.0.113.0/24 ",
      uaHash: ` ${"a".repeat(150)} `,
      now
    });

    const row = insert.insert.mock.calls[0][0];
    expect(result.claim_token).toMatch(/^cd_claim_/);
    expect(result.poll_token).toMatch(/^cd_poll_/);
    expect(result.verification_code).toMatch(/^[a-z]+-[A-HJ-NP-Z2-9]{4}$/);
    expect(row).toMatchObject({
      status: "PENDING_CLAIM",
      requested_scopes: ["deals:read", "deals:write"],
      client_version: "1.2.3",
      ip_truncated: "203.0.113.0/24",
      created_at: "2026-07-23T10:00:00.000Z",
      expires_at: "2026-07-23T10:10:00.000Z"
    });
    expect(row.requested_agent_name).toHaveLength(80);
    expect(row.client_type).toHaveLength(40);
    expect(row.ua_hash).toHaveLength(128);
    expect(row.claim_token_hash).toBe(hashConnectSessionToken(result.claim_token, "connect-test-secret"));
    expect(row.poll_token_hash).toBe(hashConnectSessionToken(result.poll_token, "connect-test-secret"));
    expect(row.verification_code_hash).toBe(
      hashConnectSessionToken(result.verification_code, "connect-test-secret")
    );
    expect(JSON.stringify(row)).not.toContain(result.claim_token);
    expect(JSON.stringify(row)).not.toContain(result.poll_token);
    expect(JSON.stringify(row)).not.toContain(result.verification_code);
    expect(row.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("distinguishes a wrong poll token from an unknown session without leaking data", async () => {
    const authenticatedLookup = makeQuery({ data: null, error: null });
    const existenceLookup = makeQuery({ data: { session_id: "session-1" }, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(
      makeClient(authenticatedLookup, existenceLookup)
    );

    await expect(
      getConnectSessionForPoll({
        sessionId: "session-1",
        pollToken: "wrong-token"
      })
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });

    const expectedHash = crypto
      .createHmac("sha256", "connect-test-secret")
      .update("wrong-token")
      .digest("hex");
    expect(authenticatedLookup.eq).toHaveBeenNthCalledWith(1, "session_id", "session-1");
    expect(authenticatedLookup.eq).toHaveBeenNthCalledWith(2, "poll_token_hash", expectedHash);
    expect(existenceLookup.select).toHaveBeenCalledWith("session_id");
  });

  it("expires a pending poll session with token and status compare-and-set guards", async () => {
    const pending = {
      session_id: "session-1",
      status: "PENDING_CLAIM",
      expires_at: "2026-07-23T09:59:59.000Z"
    };
    const expired = { ...pending, status: "EXPIRED" };
    const lookup = makeQuery({ data: pending, error: null });
    const update = makeQuery({ data: expired, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(lookup, update));

    const result = await getConnectSessionForPoll({
      sessionId: "session-1",
      pollToken: "poll-token",
      now: new Date("2026-07-23T10:00:00.000Z")
    });

    expect(result).toEqual(expired);
    expect(update.update).toHaveBeenCalledWith({
      status: "EXPIRED",
      expired_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z"
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "session_id", "session-1");
    expect(update.eq).toHaveBeenNthCalledWith(
      2,
      "poll_token_hash",
      hashConnectSessionToken("poll-token", "connect-test-secret")
    );
    expect(update.eq).toHaveBeenNthCalledWith(3, "status", "PENDING_CLAIM");
  });

  it("returns the same not-found response for an unknown or mismatched claim token", async () => {
    const failedClaim = makeQuery({ data: null, error: null });
    const fallback = makeQuery({
      data: {
        session_id: "session-1",
        claim_token_hash: hashConnectSessionToken("real-token", "connect-test-secret"),
        status: "PENDING_CLAIM",
        expires_at: "2026-07-23T10:10:00.000Z"
      },
      error: null
    });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(failedClaim, fallback));

    await expect(
      claimConnectSession({
        sessionId: "session-1",
        claimToken: "wrong-token",
        ownerId: "owner-1",
        agentId: "agent-1",
        installationId: "installation-1",
        now: new Date("2026-07-23T10:00:00.000Z")
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "CONNECT_SESSION_NOT_FOUND"
    });
    expect(failedClaim.gt).toHaveBeenCalledWith("expires_at", "2026-07-23T10:00:00.000Z");
  });

  it("claims with an atomic pending-and-unexpired guard", async () => {
    const claimed = {
      session_id: "session-1",
      status: "CLAIMED",
      owner_id: "owner-1",
      agent_id: "agent-1"
    };
    const update = makeQuery({ data: claimed, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(update));

    const result = await claimConnectSession({
      sessionId: " session-1 ",
      claimToken: " claim-token ",
      ownerId: " owner-1 ",
      agentId: " agent-1 ",
      installationId: " ",
      now: new Date("2026-07-23T10:00:00.000Z")
    });

    expect(result).toEqual(claimed);
    expect(update.update).toHaveBeenCalledWith({
      status: "CLAIMED",
      owner_id: "owner-1",
      agent_id: "agent-1",
      installation_id: null,
      claimed_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z"
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "session_id", "session-1");
    expect(update.eq).toHaveBeenNthCalledWith(
      2,
      "claim_token_hash",
      hashConnectSessionToken("claim-token", "connect-test-secret")
    );
    expect(update.eq).toHaveBeenNthCalledWith(3, "status", "PENDING_CLAIM");
    expect(update.gt).toHaveBeenCalledWith("expires_at", "2026-07-23T10:00:00.000Z");
  });

  it("expires a claim lookup with claim-token and pending-state guards", async () => {
    const pending = {
      session_id: "session-3",
      status: "PENDING_CLAIM",
      expires_at: null
    };
    const expired = { ...pending, status: "EXPIRED" };
    const lookup = makeQuery({ data: pending, error: null });
    const update = makeQuery({ data: expired, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(lookup, update));

    expect(
      await getConnectSessionByClaimToken({
        claimToken: "claim-token-3",
        now: new Date("2026-07-23T10:00:00.000Z")
      })
    ).toEqual(expired);
    expect(update.eq).toHaveBeenNthCalledWith(1, "session_id", "session-3");
    expect(update.eq).toHaveBeenNthCalledWith(
      2,
      "claim_token_hash",
      hashConnectSessionToken("claim-token-3", "connect-test-secret")
    );
    expect(update.eq).toHaveBeenNthCalledWith(3, "status", "PENDING_CLAIM");
  });

  it("treats repeated denial as idempotent but blocks denial after a claim", async () => {
    const cancelledUpdate = makeQuery({ data: null, error: null });
    const cancelledLookup = makeQuery({
      data: {
        session_id: "session-1",
        claim_token_hash: hashConnectSessionToken("claim-token", "connect-test-secret"),
        status: "CANCELLED"
      },
      error: null
    });
    mocks.getSupabaseServiceClient.mockReturnValue(
      makeClient(cancelledUpdate, cancelledLookup)
    );

    const cancelled = await denyConnectSession({
      sessionId: "session-1",
      claimToken: "claim-token"
    });
    expect(cancelled.status).toBe("CANCELLED");

    const claimedUpdate = makeQuery({ data: null, error: null });
    const claimedLookup = makeQuery({
      data: {
        session_id: "session-2",
        claim_token_hash: hashConnectSessionToken("claim-token-2", "connect-test-secret"),
        status: "CLAIMED"
      },
      error: null
    });
    mocks.getSupabaseServiceClient.mockReturnValue(
      makeClient(claimedUpdate, claimedLookup)
    );

    await expect(
      denyConnectSession({
        sessionId: "session-2",
        claimToken: "claim-token-2"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "SESSION_ALREADY_CLAIMED"
    });
  });
});
