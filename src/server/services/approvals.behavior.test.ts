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
  createApproval,
  resolveApproval} from "./approvals";

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
});
