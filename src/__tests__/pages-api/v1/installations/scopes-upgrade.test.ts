import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/agent-installations", () => ({
  revokeInstallationForOwner: vi.fn(),
  getInstallationById: vi.fn()
}));

vi.mock("../../../../server/services/api-keys", () => ({
  rotateInstallationApiKeyForOwner: vi.fn()
}));

vi.mock("../../../../server/services/approvals", () => ({
  createApproval: vi.fn()
}));

const approvalsMaybeSingle = vi.fn();
const approvalsEq3 = vi.fn(() => ({ maybeSingle: approvalsMaybeSingle }));
const approvalsEq2 = vi.fn(() => ({ eq: approvalsEq3 }));
const approvalsEq1 = vi.fn(() => ({ eq: approvalsEq2 }));
const approvalsSelect = vi.fn(() => ({ eq: approvalsEq1 }));

const approvalsUpdateMaybeSingle = vi.fn();
const approvalsUpdateEq2 = vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: approvalsUpdateMaybeSingle })) }));
const approvalsUpdateEq1 = vi.fn(() => ({ eq: approvalsUpdateEq2 }));
const approvalsUpdate = vi.fn(() => ({ eq: approvalsUpdateEq1 }));

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "approvals") {
        return {
          select: approvalsSelect,
          update: approvalsUpdate
        };
      }
      return {};
    })
  }))
}));

import { handler } from "../../../../pages/api/v1/installations/[id_action]";
import { getInstallationById } from "../../../../server/services/agent-installations";
import { createApproval } from "../../../../server/services/approvals";
import { V1_SCOPES_DEFAULT } from "../../../../shared/scopes/v1";

const getInstallationByIdMock = vi.mocked(getInstallationById);
const createApprovalMock = vi.mocked(createApproval);

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const installationId = "11111111-1111-4111-8111-111111111111";

function makeOwnerCtx(): any {
  return {
    ownerId,
    actor: { type: "owner", id: ownerId }
  };
}

describe("POST /v1/installations/:installation_id:scopes-upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approvalsMaybeSingle.mockResolvedValue({ data: null, error: null });
    approvalsUpdateMaybeSingle.mockResolvedValue({ data: null, error: null });
    getInstallationByIdMock.mockResolvedValue({
      installation_id: installationId,
      owner_id: ownerId,
      agent_id: agentId,
      oauth_scopes: [...V1_SCOPES_DEFAULT],
      status: "ACTIVE"
    } as any);
    createApprovalMock.mockResolvedValue({
      approval_id: "appr-1",
      action_payload_redacted: { requested_scopes: ["policies:*"] }
    } as any);
  });

  it("returns 400 without Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:scopes-upgrade` },
      headers: {},
      body: {}
    };

    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 when only default/legacy scopes are requested", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:scopes-upgrade` },
      headers: { "idempotency-key": "idem-1" },
      body: { requested_scopes: ["agent:read", "watchlists:read"] }
    };

    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(200);
    expect(result.body.oauth_scopes).toEqual(V1_SCOPES_DEFAULT);
    expect(createApprovalMock).not.toHaveBeenCalled();
  });

  it("returns 202 + approval_id for non-default scopes", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:scopes-upgrade` },
      headers: { "idempotency-key": "idem-1" },
      body: { requested_scopes: ["policies:*"] }
    };

    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(202);
    expect(result.body.status).toBe("PENDING_APPROVAL");
    expect(result.body.approval_id).toBe("appr-1");
    expect(result.body.requested_scopes).toEqual(["policies:*"]);
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        actionType: "scopes.upgrade",
        actionRefId: installationId
      })
    );
  });
});
