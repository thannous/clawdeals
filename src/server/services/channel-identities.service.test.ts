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
  approvePairing,
  confirmPairingCode,
  revokePairing,
  startPairing,
  upsertIdentityForPairing
} from "./channel-identities";

type QueryResult = { data: any; error: any };

function makeQuery(result: QueryResult) {
  const query: any = {};
  for (const method of ["select", "eq", "order", "limit", "upsert", "update"]) {
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

describe("channel-identities service security transitions", () => {
  const previousSecret = process.env.PAIRING_CODE_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAIRING_CODE_SECRET = "pairing-test-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.PAIRING_CODE_SECRET;
    } else {
      process.env.PAIRING_CODE_SECRET = previousSecret;
    }
  });

  it("does not rotate an already active pairing or require a secret", async () => {
    delete process.env.PAIRING_CODE_SECRET;
    const activeIdentity = {
      channel_identity_id: "identity-1",
      owner_id: "owner-1",
      state: "ACTIVE"
    };
    const lookup = makeQuery({ data: activeIdentity, error: null });
    const client = makeClient(lookup);
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await startPairing({
      ownerId: "owner-1",
      channelType: " TELEGRAM ",
      channelUserId: " 123 ",
      channelContextId: null
    });

    expect(result).toEqual({
      identity: activeIdentity,
      code: null,
      expiresAt: null,
      alreadyActive: true
    });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(lookup.eq).toHaveBeenNthCalledWith(1, "owner_id", "owner-1");
    expect(lookup.eq).toHaveBeenNthCalledWith(2, "channel_type", "telegram");
    expect(lookup.eq).toHaveBeenNthCalledWith(3, "channel_user_id", "123");
    expect(lookup.eq).toHaveBeenNthCalledWith(4, "channel_context_id", "");
  });

  it("stores only a hashed pairing code with a bounded lifetime", async () => {
    const now = new Date("2026-07-23T10:00:00.000Z");
    const lookup = makeQuery({ data: null, error: null });
    const persisted = { channel_identity_id: "identity-2", state: "PENDING" };
    const upsert = makeQuery({ data: persisted, error: null });
    const client = makeClient(lookup, upsert);
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await startPairing({
      ownerId: "owner-1",
      channelType: "Telegram",
      channelUserId: " 123 ",
      channelContextId: "x".repeat(250),
      displayName: ` Alice ${"x".repeat(100)}`,
      now
    });

    const payload = upsert.upsert.mock.calls[0][0];
    expect(result.code).toMatch(/^CD-[A-HJ-NP-Z2-9]{6}$/);
    expect(result.expiresAt.toISOString()).toBe("2026-07-23T10:10:00.000Z");
    expect(payload.pairing_code_hash).toBe(
      crypto.createHmac("sha256", "pairing-test-secret").update(result.code).digest("hex")
    );
    expect(JSON.stringify(payload)).not.toContain(result.code);
    expect(payload.channel_context_id).toHaveLength(200);
    expect(payload.display_name).toHaveLength(80);
    expect(payload).toMatchObject({
      owner_id: "owner-1",
      channel_type: "telegram",
      channel_user_id: "123",
      role: "viewer",
      state: "PENDING",
      pairing_expires_at: "2026-07-23T10:10:00.000Z"
    });
    expect(upsert.upsert).toHaveBeenCalledWith(
      payload,
      { onConflict: "channel_type,channel_user_id,channel_context_id,owner_id" }
    );
  });

  it("invalidates an expired code while preserving owner and pending-state guards", async () => {
    const identity = {
      channel_identity_id: "identity-3",
      state: "PENDING",
      pairing_expires_at: "2026-07-23T09:59:59.000Z"
    };
    const lookup = makeQuery({ data: identity, error: null });
    const clear = makeQuery({ data: null, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(lookup, clear));

    const result = await confirmPairingCode({
      ownerId: "owner-1",
      code: "CD-ABC234",
      now: new Date("2026-07-23T10:00:00.000Z")
    });

    expect(result).toEqual({ ok: false, reason: "expired", identity });
    expect(clear.update).toHaveBeenCalledWith({
      pairing_code_hash: null,
      pairing_expires_at: null
    });
    expect(clear.eq).toHaveBeenNthCalledWith(1, "channel_identity_id", "identity-3");
    expect(clear.eq).toHaveBeenNthCalledWith(2, "owner_id", "owner-1");
    expect(clear.eq).toHaveBeenNthCalledWith(3, "state", "PENDING");
  });

  it("rejects approval after expiration before issuing an update", async () => {
    const lookup = makeQuery({
      data: {
        channel_identity_id: "identity-4",
        state: "PENDING",
        pairing_code_hash: "hash",
        pairing_expires_at: "2026-07-23T09:59:59.000Z"
      },
      error: null
    });
    const client = makeClient(lookup);
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      approvePairing({
        ownerId: "owner-1",
        channelIdentityId: "identity-4",
        now: new Date("2026-07-23T10:00:00.000Z")
      })
    ).rejects.toMatchObject({ status: 409, code: "PAIRING_EXPIRED" });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("approves only the owner-scoped pending row and clears the reusable secret", async () => {
    const lookup = makeQuery({
      data: {
        channel_identity_id: "identity-5",
        state: "PENDING",
        pairing_code_hash: "hash",
        pairing_expires_at: "2026-07-23T10:10:00.000Z"
      },
      error: null
    });
    const active = { channel_identity_id: "identity-5", state: "ACTIVE", role: "approver" };
    const update = makeQuery({ data: active, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(lookup, update));

    const result = await approvePairing({
      ownerId: "owner-1",
      channelIdentityId: "identity-5",
      role: "unexpected-role",
      approvedBy: "human-1",
      now: new Date("2026-07-23T10:00:00.000Z")
    });

    expect(result).toEqual(active);
    expect(update.update).toHaveBeenCalledWith({
      state: "ACTIVE",
      role: "approver",
      approved_at: "2026-07-23T10:00:00.000Z",
      approved_by_human_id: "human-1",
      pairing_code_hash: null,
      pairing_expires_at: null,
      revoked_at: null
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "channel_identity_id", "identity-5");
    expect(update.eq).toHaveBeenNthCalledWith(2, "owner_id", "owner-1");
    expect(update.eq).toHaveBeenNthCalledWith(3, "state", "PENDING");
  });

  it("revokes only an active owner-scoped identity", async () => {
    const lookup = makeQuery({
      data: { channel_identity_id: "identity-6", state: "ACTIVE" },
      error: null
    });
    const revoked = { channel_identity_id: "identity-6", state: "REVOKED" };
    const update = makeQuery({ data: revoked, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(lookup, update));

    expect(
      await revokePairing({
        ownerId: "owner-1",
        channelIdentityId: "identity-6",
        revokedBy: "human-1",
        now: new Date("2026-07-23T10:00:00.000Z")
      })
    ).toEqual(revoked);
    expect(update.update).toHaveBeenCalledWith({
      state: "REVOKED",
      revoked_at: "2026-07-23T10:00:00.000Z",
      approved_by_human_id: "human-1",
      pairing_code_hash: null,
      pairing_expires_at: null
    });
    expect(update.eq).toHaveBeenNthCalledWith(1, "channel_identity_id", "identity-6");
    expect(update.eq).toHaveBeenNthCalledWith(2, "owner_id", "owner-1");
    expect(update.eq).toHaveBeenNthCalledWith(3, "state", "ACTIVE");
  });

  it("maps the cross-owner unique constraint to a non-leaky conflict", async () => {
    const upsert = makeQuery({
      data: null,
      error: { message: "duplicate key channel_identities_unique_channel_non_revoked_idx" }
    });
    mocks.getSupabaseServiceClient.mockReturnValue(makeClient(upsert));

    await expect(
      upsertIdentityForPairing({
        ownerId: "owner-1",
        channelType: "telegram",
        channelUserId: "123",
        state: "ACTIVE"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "CHANNEL_ALREADY_PAIRED",
      message: "Channel identity is already paired to another owner"
    });
  });
});
