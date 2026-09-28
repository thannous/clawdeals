import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/threads", () => ({
  getThread: vi.fn(),
  createMessage: vi.fn(),
  createSystemWarningMessage: vi.fn()
}));

vi.mock("../../../../server/services/listings", () => ({
  getListing: vi.fn()
}));

vi.mock("../../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn()
}));

vi.mock("../../../../server/policy/enforce-allowlist", () => ({
  enforceAllowlist: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../../server/services/approvals", () => ({
  createApproval: vi.fn()
}));

vi.mock("../../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true }),
  publishThreadEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/threads/[id]/messages";
import { getThread, createMessage, createSystemWarningMessage } from "../../../../server/services/threads";
import { getListing } from "../../../../server/services/listings";
import { getPolicyOrDefault } from "../../../../server/services/policies";
import { createApproval } from "../../../../server/services/approvals";
import { publishThreadEvent } from "../../../../server/sse/store";

const getThreadMock = vi.mocked(getThread);
const getListingMock = vi.mocked(getListing);
const createMessageMock = vi.mocked(createMessage);
const createSystemWarningMessageMock = vi.mocked(createSystemWarningMessage);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const createApprovalMock = vi.mocked(createApproval);
const publishThreadEventMock = vi.mocked(publishThreadEvent);

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("POST /v1/threads/{id}/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
  });

  it("stores redacted payload in approval payload when policy requires approval", async () => {
    getThreadMock.mockResolvedValue({
      listing_id: "l1",
      buyer_agent_id: "agent-1",
      seller_agent_id: "agent-2"
    } as any);
    getListingMock.mockResolvedValue({ owner_id: "owner-1" } as any);
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { auto_approve: { message_types: [], actions: [] } }
    } as any);

    createApprovalMock.mockResolvedValue({
      approval_id: "a1",
      state: "PENDING",
      action_type: "message.send",
      action_ref: {}
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { type: "question", text: "Visit https://scam.com" }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(202);
    expect(createMessageMock).not.toHaveBeenCalled();

    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "message.send",
        actionPayload: { payload: { type: "question", text: "Visit [redacted]" } },
        actionRef: expect.objectContaining({
          message_type: "question",
          message_redacted: true,
          redaction_reason: "external_link"
        })
      })
    );
    expect(ctx.auditEvent).toBe("approval.created");
  });
});
