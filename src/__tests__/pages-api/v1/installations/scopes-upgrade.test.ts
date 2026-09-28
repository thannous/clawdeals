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

  it("requires owner approval for newly introduced sensitive action scopes", async () => {
    const requestedScopes = ["transactions:write", "evidence:read", "evidence:write", "ratings:write"];
    createApprovalMock.mockResolvedValue({
      approval_id: "appr-sensitive",
      action_payload_redacted: { requested_scopes: requestedScopes }
    } as any);

    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:scopes-upgrade` },
      headers: { "idempotency-key": "idem-sensitive" },
      body: { requested_scopes: requestedScopes }
    };

    const result: any = await handler(req, null, makeOwnerCtx());

    expect(result.status).toBe(202);
    expect(result.body.status).toBe("PENDING_APPROVAL");
    expect(result.body.requested_scopes).toEqual(requestedScopes);
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionPayload: expect.objectContaining({ requested_scopes: requestedScopes })
      })
    );
  });
});
