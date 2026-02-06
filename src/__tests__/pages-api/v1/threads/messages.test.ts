import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/threads", () => ({
  getThread: vi.fn(),
  createMessage: vi.fn(),
  createSystemWarningMessage: vi.fn()
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

import { handler } from "../../../../pages/api/v1/threads/[id]/messages";
import { getThread, createMessage, createSystemWarningMessage } from "../../../../server/services/threads";
import { getPolicyOrDefault } from "../../../../server/services/policies";
import { createApproval } from "../../../../server/services/approvals";

const getThreadMock = vi.mocked(getThread);
const createMessageMock = vi.mocked(createMessage);
const createSystemWarningMessageMock = vi.mocked(createSystemWarningMessage);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const createApprovalMock = vi.mocked(createApproval);

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

  it("redacts link-like content and posts a system warning", async () => {
    getThreadMock.mockResolvedValue({ owner_id: "owner-1" } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { message_types: ["question"], actions: [] } } } as any);

    createMessageMock.mockResolvedValue({ id: "m1", body: "Visit [redacted]", redacted: true } as any);

    const req: any = {
      method: "POST",
      headers: {},
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { body: "Visit https://scam.com", message_type: "question" }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "11111111-1111-4111-8111-111111111111",
        body: "Visit [redacted]",
        messageType: "question",
        redacted: true
      })
    );
    expect(createSystemWarningMessageMock).toHaveBeenCalledWith({ threadId: "11111111-1111-4111-8111-111111111111" });

    expect(ctx.auditEvent).toBe("message.redacted");
    expect(JSON.stringify(ctx.body)).not.toContain("https://scam.com");
  });

  it("does not post warning for clean messages", async () => {
    getThreadMock.mockResolvedValue({ owner_id: "owner-1" } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { message_types: ["question"], actions: [] } } } as any);

    createMessageMock.mockResolvedValue({ id: "m1", body: "Is it still available?", redacted: false } as any);

    const req: any = {
      method: "POST",
      headers: {},
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { body: "Is it still available?", message_type: "question" }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(createSystemWarningMessageMock).not.toHaveBeenCalled();
    expect(ctx.auditEvent).toBe("message.sent");
  });

  it("stores redacted body in approval payload when policy requires approval", async () => {
    getThreadMock.mockResolvedValue({ owner_id: "owner-1" } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { message_types: [], actions: [] } } } as any);

    createApprovalMock.mockResolvedValue({ approval_id: "a1", state: "PENDING", action_type: "message.send", action_ref: {} } as any);

    const req: any = {
      method: "POST",
      headers: {},
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { body: "Visit https://scam.com", message_type: "question" }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(202);
    expect(createMessageMock).not.toHaveBeenCalled();

    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "message.send",
        actionPayload: { body: "Visit [redacted]" },
        actionRef: expect.objectContaining({
          message_redacted: true,
          redaction_reason: "external_link"
        })
      })
    );
    expect(ctx.auditEvent).toBe("approval.created");
  });
});
