import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/mark-completed.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/mark-completed.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/transactions/{tx_id}/mark-completed (TI-204)", () => {
  const txId = "11111111-1111-4111-8111-111111111111";
  const listingId = "22222222-2222-4222-8222-222222222222";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const baseCtx: any = {
    agentId: buyerAgentId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  };

  let handler: any;
  let markTransactionCompletedMock: any;
  let publishSseEventMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/transactions", () => ({
      markTransactionCompleted: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]/mark-completed"));

    const txMod = await import("../../../../server/services/transactions");
    markTransactionCompletedMock = vi.mocked(txMod.markTransactionCompleted);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(markTransactionCompletedMock).not.toHaveBeenCalled();
  });

  it("returns 401 when agent authentication is missing", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(markTransactionCompletedMock).not.toHaveBeenCalled();
  });

  it("validates tx_id UUID", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: "not-a-uuid" },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(markTransactionCompletedMock).not.toHaveBeenCalled();
  });

  it("first confirmation => 200 COMPLETED_PENDING_CONFIRM + pending_confirm SSE", async () => {
    markTransactionCompletedMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      tx_status: "COMPLETED_PENDING_CONFIRM",
      buyer_completed_at: "2026-02-08T12:00:00Z",
      seller_completed_at: null,
      auto_completed: false
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("COMPLETED_PENDING_CONFIRM");
    expect(result.body.buyer_completed_at).toBeTruthy();
    expect(result.body.seller_completed_at).toBeNull();

    expect(publishSseEventMock).toHaveBeenCalled();
    const types = publishSseEventMock.mock.calls.map((call) => call[0]?.type);
    expect(types).toEqual(["transaction.pending_confirm", "transaction.pending_confirm"]);
  });

  it("second confirmation => 200 COMPLETED + completed SSE", async () => {
    markTransactionCompletedMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      tx_status: "COMPLETED",
      buyer_completed_at: "2026-02-08T12:00:00Z",
      seller_completed_at: "2026-02-08T12:05:00Z",
      auto_completed: false
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: sellerAgentId, actor: { type: "agent", id: sellerAgentId } });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("COMPLETED");
    expect(result.body.auto_completed).toBe(false);
    expect(result.body.buyer_completed_at).toBeTruthy();
    expect(result.body.seller_completed_at).toBeTruthy();

    expect(publishSseEventMock).toHaveBeenCalled();
    const types = publishSseEventMock.mock.calls.map((call) => call[0]?.type);
    expect(types).toEqual(["transaction.completed", "transaction.completed"]);
  });

  it("returns TX_NOT_READY errors from service", async () => {
    markTransactionCompletedMock.mockRejectedValue(
      Object.assign(new Error("Transaction not ready"), {
        status: 409,
        code: "TX_NOT_READY",
        details: { status: "ACCEPTED" }
      })
    );

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("TX_NOT_READY");
  });
});

