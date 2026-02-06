import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/listings", () => ({
  getListing: vi.fn()
}));

vi.mock("../../../../server/services/threads", () => ({
  createThread: vi.fn(),
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

import { handler } from "../../../../pages/api/v1/listings/[id]/threads";
import { getListing } from "../../../../server/services/listings";
import { createThread, createMessage, createSystemWarningMessage } from "../../../../server/services/threads";
import { getPolicyOrDefault } from "../../../../server/services/policies";

const getListingMock = vi.mocked(getListing);
const createThreadMock = vi.mocked(createThread);
const createMessageMock = vi.mocked(createMessage);
const createSystemWarningMessageMock = vi.mocked(createSystemWarningMessage);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("POST /v1/listings/{id}/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
  });

  it("supports optional initial message with redaction + warning", async () => {
    getListingMock.mockResolvedValue({ owner_id: "owner-1" } as any);
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { auto_approve: { actions: ["thread.create"], message_types: [] } } } as any);

    createThreadMock.mockResolvedValue({ id: "t1", listing_id: "l1" } as any);

    const req: any = {
      method: "POST",
      headers: {},
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { body: "Check www.paypal.com", message_type: "question" }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(createThreadMock).toHaveBeenCalled();
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "t1",
        body: "Check [redacted]",
        messageType: "question",
        redacted: true
      })
    );
    expect(createSystemWarningMessageMock).toHaveBeenCalledWith({ threadId: "t1" });

    expect(ctx.auditEvent).toBe("thread.created");
    expect(JSON.stringify(ctx.body)).not.toContain("paypal.com");
  });
});
