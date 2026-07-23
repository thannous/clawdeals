import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createOwnerSession,
  getOwnerSessionByTokenHash,
  incrementOwnerSessionAttempt,
  markOwnerSessionActive,
  markOwnerSessionExpired,
  markOwnerSessionRevoked,
  touchOwnerSession
} from "./owner-sessions";

type QueryResult = { data: any; error: any };

function makeQuery(result: QueryResult) {
  const query: any = {};
  for (const method of ["select", "eq", "gt", "lte", "in", "insert", "update"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  return query;
}

describe("owner-sessions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and normalizes newly created session limits and metadata", async () => {
    const persisted = { session_id: "session-1", status: "PENDING" };
    const query = makeQuery({ data: persisted, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => query) });
    const now = new Date("2026-07-23T10:00:00.000Z");

    const result = await createOwnerSession({
      ownerId: " owner-1 ",
      tokenHash: " token-hash ",
      expiresAt: new Date("2026-07-23T10:15:00.000Z"),
      maxAttempts: 0,
      ipTruncated: " 203.0.113.0/24 ",
      uaHash: " ua-hash ",
      now
    });

    expect(result).toEqual(persisted);
    expect(query.insert).toHaveBeenCalledWith({
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: "token-hash",
      attempt_count: 0,
      max_attempts: 1,
      ip_truncated: "203.0.113.0/24",
      ua_hash: "ua-hash",
      created_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z",
      expires_at: "2026-07-23T10:15:00.000Z"
    });
  });

  it("rejects invalid expiry values before accessing storage", async () => {
    await expect(
      createOwnerSession({
        ownerId: "owner-1",
        tokenHash: "token-hash",
        expiresAt: new Date("invalid")
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "expiresAt is required"
    });
    expect(mocks.getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("activates only pending, unexpired sessions", async () => {
    const active = { session_id: "session-1", status: "ACTIVE" };
    const query = makeQuery({ data: active, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => query) });
    const now = new Date("2026-07-23T10:00:00.000Z");

    const result = await markOwnerSessionActive(" session-1 ", now);

    expect(result).toEqual(active);
    expect(query.update).toHaveBeenCalledWith({
      status: "ACTIVE",
      activated_at: "2026-07-23T10:00:00.000Z",
      last_used_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z"
    });
    expect(query.eq).toHaveBeenNthCalledWith(1, "session_id", "session-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "status", "PENDING");
    expect(query.gt).toHaveBeenCalledWith("expires_at", "2026-07-23T10:00:00.000Z");
  });

  it("expires only pending or active sessions whose deadline passed", async () => {
    const expired = { session_id: "session-1", status: "EXPIRED" };
    const query = makeQuery({ data: expired, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => query) });
    const now = new Date("2026-07-23T10:00:00.000Z");

    expect(await markOwnerSessionExpired("session-1", now)).toEqual(expired);
    expect(query.in).toHaveBeenCalledWith("status", ["PENDING", "ACTIVE"]);
    expect(query.lte).toHaveBeenCalledWith("expires_at", "2026-07-23T10:00:00.000Z");
  });

  it("touches only active, unexpired sessions and preserves a null compare-and-set result", async () => {
    const query = makeQuery({ data: null, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => query) });
    const now = new Date("2026-07-23T10:00:00.000Z");

    expect(await touchOwnerSession("session-1", now)).toBeNull();
    expect(query.eq).toHaveBeenNthCalledWith(1, "session_id", "session-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "status", "ACTIVE");
    expect(query.gt).toHaveBeenCalledWith("expires_at", "2026-07-23T10:00:00.000Z");
  });

  it("looks up bearer hashes exactly and returns null when absent", async () => {
    const query = makeQuery({ data: null, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => query) });

    expect(await getOwnerSessionByTokenHash(" token-hash ")).toBeNull();
    expect(query.eq).toHaveBeenCalledWith("token_hash", "token-hash");
  });

  it("clamps attempt counters and records explicit revocation timestamps", async () => {
    const increment = makeQuery({
      data: { session_id: "session-1", attempt_count: 0 },
      error: null
    });
    const revoke = makeQuery({
      data: { session_id: "session-1", status: "REVOKED" },
      error: null
    });
    mocks.getSupabaseServiceClient
      .mockReturnValueOnce({ from: vi.fn(() => increment) })
      .mockReturnValueOnce({ from: vi.fn(() => revoke) });
    const now = new Date("2026-07-23T10:00:00.000Z");

    await incrementOwnerSessionAttempt("session-1", -4.2, now);
    await markOwnerSessionRevoked("session-1", now);

    expect(increment.update).toHaveBeenCalledWith({
      attempt_count: 0,
      updated_at: "2026-07-23T10:00:00.000Z"
    });
    expect(revoke.update).toHaveBeenCalledWith({
      status: "REVOKED",
      revoked_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z"
    });
  });
});
