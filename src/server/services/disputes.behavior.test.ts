import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  beginResolveDispute,
  openDispute,
  resolveDispute,
  rollbackResolveDisputeLock
} from "./disputes";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    update: vi.fn(() => query)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function createRpcClient(result: any) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc };
}

describe("disputes service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens disputes through the atomic RPC with normalized optional notes", async () => {
    const row = { dispute_id: "dispute-1", status: "OPEN" };
    const harness = createRpcClient({ data: row, error: null });
    dbMocks.getSupabaseServiceClient.mockReturnValue(harness.client);

    await expect(
      openDispute({
        escrowId: "escrow-1",
        actorAgentId: "buyer-1",
        reasonCode: "item_not_received"
      })
    ).resolves.toEqual(row);
    expect(harness.rpc).toHaveBeenCalledWith("dispute_open_v0", {
      p_escrow_id: "escrow-1",
      p_actor_agent_id: "buyer-1",
      p_reason_code: "item_not_received",
      p_opened_notes_redacted: null
    });
  });

  it("resolves disputes through the atomic RPC and preserves validation details", async () => {
    const failure = createRpcClient({
      data: null,
      error: { message: "VALIDATION_ERROR:PSP_REFERENCE_ID" }
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(failure.client);

    await expect(
      resolveDispute({
        disputeId: "dispute-1",
        resolution: "REFUND",
        resolutionNotesRedacted: "verified",
        pspReferenceId: ""
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      details: { field: "PSP_REFERENCE_ID" }
    });
    expect(failure.rpc).toHaveBeenCalledWith("dispute_resolve_v0", {
      p_dispute_id: "dispute-1",
      p_resolution: "REFUND",
      p_resolution_notes_redacted: "verified",
      p_psp_reference_id: ""
    });
  });

  it("wins the guarded OPEN to UNDER_REVIEW transition before PSP work", async () => {
    const updated = { dispute_id: "dispute-1", status: "UNDER_REVIEW" };
    const updateQuery = createQuery({ data: updated, error: null });
    const client = { from: vi.fn(() => updateQuery) };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(beginResolveDispute({ disputeId: "dispute-1" })).resolves.toEqual({
      state: "locked",
      dispute: updated
    });
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "UNDER_REVIEW" })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith("status", "OPEN");
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "already resolved",
      { dispute_id: "dispute-1", status: "RESOLVED" },
      { state: "already_resolved", dispute: { dispute_id: "dispute-1", status: "RESOLVED" } }
    ],
    [
      "being resolved concurrently",
      { dispute_id: "dispute-1", status: "UNDER_REVIEW" },
      { status: 409, code: "DISPUTE_RESOLUTION_IN_PROGRESS" }
    ],
    [
      "in a non-resolvable state",
      { dispute_id: "dispute-1", status: "CANCELLED" },
      { status: 409, code: "INVALID_STATE", details: { status: "CANCELLED" } }
    ],
    [
      "deleted concurrently",
      null,
      { status: 404, code: "DISPUTE_NOT_FOUND" }
    ]
  ])("handles a lost resolution lock when the dispute is %s", async (_label, current, expected) => {
    const lostUpdateQuery = createQuery({ data: null, error: null });
    const currentQuery = createQuery({ data: current, error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(lostUpdateQuery)
        .mockReturnValueOnce(currentQuery)
    };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = beginResolveDispute({ disputeId: "dispute-1" });
    if ("state" in expected) {
      await expect(result).resolves.toEqual(expected);
    } else {
      await expect(result).rejects.toMatchObject(expected);
    }
  });

  it("rolls back only a lock that is still UNDER_REVIEW", async () => {
    const query = createQuery({ data: null, error: null });
    const client = { from: vi.fn(() => query) };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      rollbackResolveDisputeLock({ disputeId: "dispute-1" })
    ).resolves.toEqual({ ok: true });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "OPEN" }));
    expect(query.eq).toHaveBeenCalledWith("dispute_id", "dispute-1");
    expect(query.eq).toHaveBeenCalledWith("status", "UNDER_REVIEW");
  });
});
