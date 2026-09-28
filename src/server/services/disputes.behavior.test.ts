import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  beginResolveDispute,
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

describe("disputes service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
