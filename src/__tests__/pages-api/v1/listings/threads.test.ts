import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/listings", () => ({
  getListing: vi.fn()
}));

vi.mock("../../../../server/services/threads", () => ({
  getThreadForBuyerListing: vi.fn(),
  createOrGetThread: vi.fn(),
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

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/listings/[id]/threads";
import { getListing } from "../../../../server/services/listings";
import {
  getThreadForBuyerListing,
  createOrGetThread,
  createMessage,
  createSystemWarningMessage
} from "../../../../server/services/threads";
import { getPolicyOrDefault } from "../../../../server/services/policies";
import { createApproval } from "../../../../server/services/approvals";

const getListingMock = vi.mocked(getListing);
const getThreadForBuyerListingMock = vi.mocked(getThreadForBuyerListing);
const createOrGetThreadMock = vi.mocked(createOrGetThread);
const createMessageMock = vi.mocked(createMessage);
const createSystemWarningMessageMock = vi.mocked(createSystemWarningMessage);
const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const createApprovalMock = vi.mocked(createApproval);

const baseCtx: any = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  actor: { type: "agent", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  authError: null
};

describe("POST /v1/listings/{id}/threads (TI-196)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(getThreadForBuyerListingMock).not.toHaveBeenCalled();
  });

  it("returns 200 when thread already exists (create-or-return) without calling listing/policy", async () => {
    getThreadForBuyerListingMock.mockResolvedValue({
      thread_id: "t1",
      listing_id: "11111111-1111-4111-8111-111111111111",
      buyer_agent_id: baseCtx.agentId,
      seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "OPEN",
      created_at: new Date().toISOString()
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { message: { type: "question", text: "ignored" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.thread_id).toBe("t1");
    expect(result.body.initial_message_id).toBeNull();
    expect(getListingMock).not.toHaveBeenCalled();
    expect(getPolicyOrDefaultMock).not.toHaveBeenCalled();
    expect(createOrGetThreadMock).not.toHaveBeenCalled();
    expect(createMessageMock).not.toHaveBeenCalled();
  });

  it("returns 404 for non-LIVE listing when no existing thread", async () => {
    getThreadForBuyerListingMock.mockResolvedValue(null);
    getListingMock.mockResolvedValue({
      listing_id: "11111111-1111-4111-8111-111111111111",
      owner_id: baseCtx.ownerId,
      seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "DRAFT"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
    expect(createOrGetThreadMock).not.toHaveBeenCalled();
  });

  it("returns 400 SELF_THREAD_FORBIDDEN when buyer tries to thread their own listing", async () => {
    getThreadForBuyerListingMock.mockResolvedValue(null);
    getListingMock.mockResolvedValue({
      listing_id: "11111111-1111-4111-8111-111111111111",
      owner_id: baseCtx.ownerId,
      seller_agent_id: baseCtx.agentId,
      status: "LIVE"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("SELF_THREAD_FORBIDDEN");
    expect(createOrGetThreadMock).not.toHaveBeenCalled();
  });

  it("rejects invalid initial message schema and does not create a thread", async () => {
    getThreadForBuyerListingMock.mockResolvedValue(null);
    getListingMock.mockResolvedValue({
      listing_id: "11111111-1111-4111-8111-111111111111",
      owner_id: baseCtx.ownerId,
      seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "LIVE"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { message: { type: "question" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("SCHEMA_VALIDATION_FAILED");
    expect(createOrGetThreadMock).not.toHaveBeenCalled();
  });

  it("creates a new thread with optional initial message (redaction + warning) and returns v0 response", async () => {
    getThreadForBuyerListingMock.mockResolvedValue(null);
    getListingMock.mockResolvedValue({
      listing_id: "11111111-1111-4111-8111-111111111111",
      owner_id: baseCtx.ownerId,
      seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "LIVE"
    } as any);
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { auto_approve: { actions: ["thread.create"], message_types: [] } }
    } as any);

    createOrGetThreadMock.mockResolvedValue({
      thread: {
        thread_id: "t1",
        listing_id: "11111111-1111-4111-8111-111111111111",
        buyer_agent_id: baseCtx.agentId,
        seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "OPEN",
        created_at: new Date().toISOString()
      },
      created: true
    } as any);

    createMessageMock.mockResolvedValue({ message_id: "m1" } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: {
        intent: "BUY",
        message: { type: "question", text: "Check www.paypal.com" }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(result.body).toEqual(
      expect.objectContaining({
        thread_id: "t1",
        listing_id: "11111111-1111-4111-8111-111111111111",
        buyer_agent_id: baseCtx.agentId,
        seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "OPEN",
        initial_message_id: "m1"
      })
    );

    expect(createOrGetThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "11111111-1111-4111-8111-111111111111",
        buyerAgentId: baseCtx.agentId
      })
    );

    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "t1",
        type: "question",
        redacted: true
      })
    );

    expect(createSystemWarningMessageMock).toHaveBeenCalledWith({ threadId: "t1" });
    expect(ctx.auditEvent).toBe("thread.created");
    expect(JSON.stringify(ctx.body)).not.toContain("paypal.com");
  });

  it("returns 202 + creates approval when policy requires approval (and does not create thread)", async () => {
    getThreadForBuyerListingMock.mockResolvedValue(null);
    getListingMock.mockResolvedValue({
      listing_id: "11111111-1111-4111-8111-111111111111",
      owner_id: baseCtx.ownerId,
      seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "LIVE"
    } as any);
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { auto_approve: { actions: [], message_types: [] } }
    } as any);

    createApprovalMock.mockResolvedValue({
      approval_id: "appr-1",
      state: "PENDING",
      action_type: "thread.create",
      action_ref: {}
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      query: { id: "11111111-1111-4111-8111-111111111111" },
      body: { message: { type: "question", text: "Visit https://scam.com" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(202);
    expect(result.body.data.approval_id).toBe("appr-1");
    expect(createOrGetThreadMock).not.toHaveBeenCalled();

    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "thread.create",
        actionPayload: { payload: { type: "question", text: "Visit [redacted]" } },
        actionRef: expect.objectContaining({
          listing_id: "11111111-1111-4111-8111-111111111111",
          buyer_agent_id: baseCtx.agentId,
          seller_agent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          message_type: "question",
          message_redacted: true,
          redaction_reason: "external_link"
        })
      })
    );

    expect(ctx.auditEvent).toBe("approval.created");
  });
});

