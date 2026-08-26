import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  deleteCachedInstallationOauthScopes: vi.fn(),
  getSupabaseServiceClient: vi.fn(),
  processApprovalJobByApprovalId: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

vi.mock("./approval-jobs", () => ({
  processApprovalJobByApprovalId: dependencyMocks.processApprovalJobByApprovalId
}));

vi.mock("./installation-scopes-cache", () => ({
  deleteCachedInstallationOauthScopes: dependencyMocks.deleteCachedInstallationOauthScopes
}));

import {
  bulkResolveApprovals,
  cancelPendingListingPublishApproval,
  computeApprovalAge,
  createApproval,
  decodeApprovalCursor,
  getApproval,
  getApprovalForOwner,
  isApprovalStale,
  listAllApprovals,
  listApprovals,
  resolveApproval,
  upsertPendingApproval
} from "./approvals";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    insert: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

describe("approvals service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencyMocks.deleteCachedInstallationOauthScopes.mockResolvedValue(undefined);
    dependencyMocks.processApprovalJobByApprovalId.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.APPROVAL_SLA_HOURS;
  });

  it("redacts sensitive payload fields and returns the winner of a duplicate create race", async () => {
    const duplicateQuery = createQuery({
      data: null,
      error: { message: "duplicate key value violates unique constraint approvals_pending_idx" }
    });
    const winner = {
      approval_id: "approval-winner",
      owner_id: "owner-1",
      action_type: "offer.accept",
      action_ref_id: "offer-1",
      state: "PENDING"
    };
    const existingQuery = createQuery({ data: winner, error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(duplicateQuery)
        .mockReturnValueOnce(existingQuery)
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      createApproval({
        ownerId: "owner-1",
        actionType: "offer.accept",
        actionRef: { offer_id: "offer-1" },
        actionRefId: "offer-1",
        actionPayload: {
          email: "buyer@example.test",
          nested: { api_key: "secret", amount: 120 }
        },
        createdByAgentId: "agent-1"
      })
    ).resolves.toEqual(winner);

    expect(duplicateQuery.insert).toHaveBeenCalledWith({
      owner_id: "owner-1",
      action_type: "offer.accept",
      action_ref: { offer_id: "offer-1" },
      action_ref_id: "offer-1",
      action_payload_redacted: {
        email: "[REDACTED]",
        nested: { api_key: "[REDACTED]", amount: 120 }
      },
      created_by_agent_id: "agent-1"
    });
    expect(existingQuery.eq).toHaveBeenCalledWith("owner_id", "owner-1");
  });

  it("reopens an approval with an atomic upsert and clears prior resolution fields", async () => {
    const query = createQuery({ data: { approval_id: "approval-1", state: "PENDING" }, error: null });
    const client = { from: vi.fn(() => query) };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);
    const now = new Date("2026-07-23T10:00:00.000Z");

    await upsertPendingApproval({
      ownerId: "owner-1",
      actionType: "escrow.confirm_received",
      actionRef: { escrow_id: "escrow-1" },
      actionRefId: "escrow-1",
      actionPayload: { token: "hidden", status: "DELIVERED" },
      createdByAgentId: "agent-1",
      now
    });

    expect(query.upsert).toHaveBeenCalledWith(
      {
        owner_id: "owner-1",
        action_type: "escrow.confirm_received",
        action_ref: { escrow_id: "escrow-1" },
        action_ref_id: "escrow-1",
        action_payload_redacted: { token: "[REDACTED]", status: "DELIVERED" },
        created_by_agent_id: "agent-1",
        state: "PENDING",
        created_at: now.toISOString(),
        resolved_at: null,
        resolved_by_human_id: null,
        resolved_reason_text: null
      },
      { onConflict: "owner_id,action_type,action_ref_id" }
    );
  });

  it("filters owner approvals, escapes cursor values, and returns the next page cursor", async () => {
    const rows = [
      { approval_id: "approval-3", created_at: "2026-07-23T12:03:00.000Z" },
      { approval_id: "approval-2", created_at: "2026-07-23T12:02:00.000Z" },
      { approval_id: "approval-1", created_at: "2026-07-23T12:01:00.000Z" }
    ];
    const query = createQuery({ data: rows, error: null });
    const client = { from: vi.fn(() => query) };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await listApprovals({
      ownerId: "owner-1",
      state: "PENDING",
      agentId: "agent-1",
      limit: 2,
      cursor: {
        created_at: '2026-07-23T12:04:00.000"Z',
        approval_id: 'approval-"4'
      }
    });

    expect(query.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    expect(query.eq).toHaveBeenCalledWith("state", "PENDING");
    expect(query.eq).toHaveBeenCalledWith("created_by_agent_id", "agent-1");
    expect(query.or).toHaveBeenCalledWith(
      'created_at.lt."2026-07-23T12:04:00.000\\"Z",and(created_at.eq."2026-07-23T12:04:00.000\\"Z",approval_id.lt."approval-\\"4")'
    );
    expect(result.approvals).toEqual(rows.slice(0, 2));
    expect(decodeApprovalCursor(result.nextCursor)?.value).toEqual(rows[1]);
  });

  it("falls back to the legacy resolve RPC only when the database rejects p_reason", async () => {
    const existingQuery = createQuery({
      data: {
        approval_id: "approval-1",
        owner_id: "owner-1",
        action_type: "offer.accept",
        state: "PENDING"
      },
      error: null
    });
    const rpc = vi
      .fn()
      .mockReturnValueOnce({
        single: vi.fn(async () => ({
          data: null,
          error: { message: "Could not find the function with parameter p_reason" }
        }))
      })
      .mockReturnValueOnce({
        single: vi.fn(async () => ({
          data: { approval_id: "approval-1", state: "APPROVED" },
          error: null
        }))
      });
    const client = { from: vi.fn(() => existingQuery), rpc };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      resolveApproval({
        approvalId: "approval-1",
        ownerId: "owner-1",
        decision: "APPROVED",
        resolvedBy: "human-1",
        reason: "verified"
      })
    ).resolves.toMatchObject({ state: "APPROVED" });

    expect(rpc).toHaveBeenNthCalledWith(1, "resolve_approval", {
      p_approval_id: "approval-1",
      p_owner_id: "owner-1",
      p_decision: "APPROVED",
      p_resolved_by: "human-1",
      p_reason: "verified"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "resolve_approval", {
      p_approval_id: "approval-1",
      p_owner_id: "owner-1",
      p_decision: "APPROVED",
      p_resolved_by: "human-1"
    });
  });

  it("maps a changed offer during approval resolution to a stable conflict", async () => {
    const existingQuery = createQuery({
      data: {
        approval_id: "approval-1",
        owner_id: "owner-1",
        action_type: "offer_over_budget",
        state: "PENDING"
      },
      error: null
    });
    const rpc = vi.fn().mockReturnValue({
      single: vi.fn(async () => ({
        data: null,
        error: { message: "offer not counterable" }
      }))
    });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => existingQuery),
      rpc
    });

    await expect(
      resolveApproval({
        approvalId: "approval-1",
        ownerId: "owner-1",
        decision: "APPROVED",
        resolvedBy: "human-1"
      })
    ).rejects.toMatchObject({ status: 409, code: "APPROVAL_STALE" });
  });

  it("invalidates cached scopes after a direct approved scopes.upgrade resolution", async () => {
    const existingQuery = createQuery({
      data: {
        approval_id: "approval-1",
        owner_id: "owner-1",
        action_type: "scopes.upgrade",
        action_ref: {},
        action_ref_id: "installation-1",
        state: "PENDING"
      },
      error: null
    });
    const updateQuery = createQuery({
      data: {
        approval_id: "approval-1",
        action_type: "scopes.upgrade",
        action_ref: {},
        action_ref_id: "installation-1",
        state: "APPROVED"
      },
      error: null
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(updateQuery)
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await resolveApproval({
      approvalId: "approval-1",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "human-1"
    });

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "APPROVED",
        resolved_by_human_id: "human-1",
        resolved_reason_text: null
      })
    );
    expect(dependencyMocks.deleteCachedInstallationOauthScopes).toHaveBeenCalledWith("installation-1");
  });

  it("enqueues approved escrow confirmation work only after the guarded state transition", async () => {
    const existingQuery = createQuery({
      data: {
        approval_id: "approval-escrow",
        owner_id: "owner-1",
        action_type: "escrow.confirm_received",
        state: "PENDING"
      },
      error: null
    });
    const updateQuery = createQuery({
      data: {
        approval_id: "approval-escrow",
        action_type: "escrow.confirm_received",
        state: "APPROVED"
      },
      error: null
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(updateQuery)
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await resolveApproval({
      approvalId: "approval-escrow",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "human-1"
    });

    expect(updateQuery.eq).toHaveBeenCalledWith("state", "PENDING");
    expect(dependencyMocks.processApprovalJobByApprovalId).toHaveBeenCalledWith("approval-escrow");
  });

  it("returns the concurrent winner when a direct resolution loses its PENDING update race", async () => {
    const existing = {
      approval_id: "approval-race",
      owner_id: "owner-1",
      action_type: "escrow.create",
      state: "PENDING"
    };
    const existingQuery = createQuery({ data: existing, error: null });
    const lostUpdateQuery = createQuery({ data: null, error: null });
    const winnerQuery = createQuery({
      data: { ...existing, state: "DENIED", resolved_by_human_id: "other-human" },
      error: null
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(lostUpdateQuery)
        .mockReturnValueOnce(winnerQuery)
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      resolveApproval({
        approvalId: "approval-race",
        ownerId: "owner-1",
        decision: "APPROVED",
        resolvedBy: "human-1"
      })
    ).resolves.toMatchObject({
      state: "DENIED",
      resolved_by_human_id: "other-human"
    });
    expect(dependencyMocks.processApprovalJobByApprovalId).not.toHaveBeenCalled();
    expect(dependencyMocks.deleteCachedInstallationOauthScopes).not.toHaveBeenCalled();
  });

  it("keeps the last observed row when listing approval cancellation loses a race", async () => {
    const existing = {
      approval_id: "approval-listing",
      owner_id: "owner-1",
      action_type: "listing_publish",
      action_ref_id: "listing-1",
      state: "PENDING"
    };
    const existingQuery = createQuery({ data: existing, error: null });
    const lostUpdateQuery = createQuery({ data: null, error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(lostUpdateQuery)
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      cancelPendingListingPublishApproval({
        ownerId: "owner-1",
        listingId: "listing-1",
        now: new Date("2026-07-23T13:00:00.000Z")
      })
    ).resolves.toEqual(existing);
    expect(lostUpdateQuery.eq).toHaveBeenCalledWith("state", "PENDING");
  });

  it("computes approval age and honors the configured stale threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:30:00.000Z"));
    process.env.APPROVAL_SLA_HOURS = "48";

    expect(computeApprovalAge("2026-07-21T11:00:00.000Z")).toEqual({ hours: 49, days: 2 });
    expect(isApprovalStale("2026-07-21T13:00:00.000Z")).toBe(false);
    expect(isApprovalStale("2026-07-21T12:00:00.000Z")).toBe(true);
    expect(isApprovalStale("2026-07-23T00:00:00.000Z", 12)).toBe(true);
  });

  it("gets approvals with and without owner scope and maps lookup failures", async () => {
    const approval = { approval_id: "approval-1", owner_id: "owner-1" };
    const first = createQuery({ data: approval, error: null });
    const second = createQuery({ data: null, error: null });
    const failure = createQuery({
      data: null,
      error: { message: "approval lookup failed", code: "PGRST500" }
    });
    dependencyMocks.getSupabaseServiceClient
      .mockReturnValueOnce({ from: vi.fn(() => first) })
      .mockReturnValueOnce({ from: vi.fn(() => second) })
      .mockReturnValueOnce({ from: vi.fn(() => failure) });

    await expect(getApproval("approval-1")).resolves.toEqual(approval);
    expect(first.eq).toHaveBeenCalledWith("approval_id", "approval-1");
    await expect(getApprovalForOwner("approval-2", "owner-1")).resolves.toBeNull();
    expect(second.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    await expect(getApproval("approval-3")).rejects.toMatchObject({
      message: "approval lookup failed"
    });
  });

  it("rejects missing approvals, invalid direct decisions and RPC errors", async () => {
    const missing = createQuery({ data: null, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValueOnce({
      from: vi.fn(() => missing)
    });
    await expect(resolveApproval({
      approvalId: "missing",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "human-1"
    })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    const direct = createQuery({
      data: {
        approval_id: "approval-direct",
        owner_id: "owner-1",
        action_type: "escrow.create",
        state: "PENDING"
      },
      error: null
    });
    dependencyMocks.getSupabaseServiceClient.mockReturnValueOnce({
      from: vi.fn(() => direct)
    });
    await expect(resolveApproval({
      approvalId: "approval-direct",
      ownerId: "owner-1",
      decision: "CANCELLED",
      resolvedBy: "human-1"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const rpcExisting = createQuery({
      data: {
        approval_id: "approval-rpc",
        owner_id: "owner-1",
        action_type: "offer.accept",
        state: "PENDING"
      },
      error: null
    });
    const rpcClient = {
      from: vi.fn(() => rpcExisting),
      rpc: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: null,
          error: { message: "RPC transaction failed", code: "PGRST500" }
        }))
      }))
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(rpcClient);
    await expect(resolveApproval({
      approvalId: "approval-rpc",
      ownerId: "owner-1",
      decision: "DENIED",
      resolvedBy: "human-1"
    })).rejects.toMatchObject({ message: "RPC transaction failed" });
  });

  it("bulk-resolves pending approvals while isolating per-item failures", async () => {
    await expect(bulkResolveApprovals({
      approvalIds: [],
      decision: "APPROVED",
      resolvedBy: "human-1"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(bulkResolveApprovals({
      approvalIds: Array.from({ length: 51 }, (_, index) => `approval-${index}`),
      decision: "APPROVED",
      resolvedBy: "human-1"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const missing = createQuery({ data: null, error: null });
    const alreadyResolved = createQuery({
      data: { approval_id: "approval-done", owner_id: "owner-1", state: "DENIED" },
      error: null
    });
    const pending = {
      approval_id: "approval-pending",
      owner_id: "owner-1",
      action_type: "offer.accept",
      state: "PENDING"
    };
    const pendingLookup = createQuery({ data: pending, error: null });
    const ownerLookup = createQuery({ data: pending, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(missing)
        .mockReturnValueOnce(alreadyResolved)
        .mockReturnValueOnce(pendingLookup)
        .mockReturnValueOnce(ownerLookup),
      rpc: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { ...pending, state: "APPROVED" },
          error: null
        }))
      }))
    };
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(bulkResolveApprovals({
      approvalIds: ["approval-missing", "approval-done", "approval-pending"],
      decision: "APPROVED",
      resolvedBy: "human-1",
      reason: "bulk review"
    })).resolves.toEqual({
      resolved: [{ ...pending, state: "APPROVED" }],
      errors: [
        { approval_id: "approval-missing", error: "Not found" },
        { approval_id: "approval-done", error: "Already resolved" }
      ]
    });
  });

  it("validates and short-circuits listing approval cancellation", async () => {
    await expect(cancelPendingListingPublishApproval({
      ownerId: "",
      listingId: "listing-1"
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(cancelPendingListingPublishApproval({
      ownerId: "owner-1",
      listingId: null
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const missing = createQuery({ data: null, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValueOnce({
      from: vi.fn(() => missing)
    });
    await expect(cancelPendingListingPublishApproval({
      ownerId: "owner-1",
      listingId: "listing-1"
    })).resolves.toBeNull();

    const approved = {
      approval_id: "approval-approved",
      owner_id: "owner-1",
      action_ref_id: "listing-1",
      state: "APPROVED"
    };
    const approvedQuery = createQuery({ data: approved, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValueOnce({
      from: vi.fn(() => approvedQuery)
    });
    await expect(cancelPendingListingPublishApproval({
      ownerId: "owner-1",
      listingId: "listing-1"
    })).resolves.toEqual(approved);
    expect(approvedQuery.update).not.toHaveBeenCalled();
  });

  it("lists all approvals with operational filters and pagination", async () => {
    const rows = [
      { approval_id: "approval-3", created_at: "2026-07-23T12:03:00.000Z" },
      { approval_id: "approval-2", created_at: "2026-07-23T12:02:00.000Z" },
      { approval_id: "approval-1", created_at: "2026-07-23T12:01:00.000Z" }
    ];
    const query = createQuery({ data: rows, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => query)
    });

    const result = await listAllApprovals({
      state: "PENDING",
      actionType: "offer.accept",
      createdByAgentId: "agent-1",
      limit: 2,
      cursor: {
        created_at: "2026-07-23T13:00:00.000Z",
        approval_id: "approval-4"
      }
    });
    expect(query.eq).toHaveBeenCalledWith("state", "PENDING");
    expect(query.eq).toHaveBeenCalledWith("action_type", "offer.accept");
    expect(query.eq).toHaveBeenCalledWith("created_by_agent_id", "agent-1");
    expect(query.or).toHaveBeenCalled();
    expect(result.approvals).toEqual(rows.slice(0, 2));
    expect(result.nextCursor).toEqual(expect.any(String));
  });
});
