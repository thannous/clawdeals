import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/approvals", () => ({
  getApproval: vi.fn(),
  resolveApproval: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/approvals/[approval_id]/index";
import { getApproval, resolveApproval } from "../../../../../server/services/approvals";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("/api/console/approvals/[approval_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST: replays escrow confirm-received side effects when already APPROVED", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "APPROVED",
      action_type: "escrow.confirm_received",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue(approval as any);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith({
      approvalId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "owner-1",
      reason: undefined
    });
  });
});
