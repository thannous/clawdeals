import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/ratings.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/ratings.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/transactions/{tx_id}/ratings (TI-205)", () => {
  const txId = "11111111-1111-4111-8111-111111111111";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const baseCtx: any = {
    agentId: buyerAgentId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  };

  let handler: any;
  let getTransactionMock: any;
  let createRatingMock: any;
  let publishSseEventMock: any;
  let enqueueTrustScoreRecalcMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/transactions", () => ({
      getTransaction: vi.fn()
    }));

    vi.doMock("../../../../server/services/ratings", () => ({
      createRating: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    vi.doMock("../../../../server/trustscore/queue", () => ({
      enqueueTrustScoreRecalc: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]/ratings"));

    const txMod = await import("../../../../server/services/transactions");
    getTransactionMock = vi.mocked(txMod.getTransaction);

    const ratingsMod = await import("../../../../server/services/ratings");
    createRatingMock = vi.mocked(ratingsMod.createRating);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);

    const queueMod = await import("../../../../server/trustscore/queue");
    enqueueTrustScoreRecalcMock = vi.mocked(queueMod.enqueueTrustScoreRecalc);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: { tx_id: txId },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns 401 when agent authentication is missing", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("validates tx_id UUID", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: "not-a-uuid" },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns INVALID_SCORE when score is out of range", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 6 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_SCORE");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns COMMENT_TOO_LONG when comment exceeds limit", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5, comment: "a".repeat(281) }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("COMMENT_TOO_LONG");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns TX_NOT_COMPLETED when tx status is not COMPLETED", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED"
    });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("TX_NOT_COMPLETED");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns 404 TX_NOT_FOUND for non-party callers", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      buyer_agent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      seller_agent_id: sellerAgentId,
      status: "COMPLETED"
    });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("TX_NOT_FOUND");
    expect(createRatingMock).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_RATED when service reports duplicate", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "COMPLETED"
    });

    createRatingMock.mockRejectedValue(Object.assign(new Error("Rating already submitted"), { status: 409, code: "ALREADY_RATED" }));

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5 }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ALREADY_RATED");
  });

  it("creates rating, publishes SSE, and enqueues trustscore recalc", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "COMPLETED"
    });

    createRatingMock.mockResolvedValue({
      rating_id: "99999999-9999-4999-8999-999999999999",
      tx_id: txId,
      rater_agent_id: buyerAgentId,
      rated_agent_id: sellerAgentId,
      score: 5,
      reason_code: "AS_DESCRIBED",
      comment_redacted: "Check my site [redacted]",
      created_at: "2026-02-08T12:00:00Z"
    });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { score: 5, reason_code: "AS_DESCRIBED", comment: "Check my site https://example.com" }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.tx_id).toBe(txId);
    expect(result.body.rated_agent_id).toBe(sellerAgentId);
    expect(result.body.comment_redacted).toContain("[redacted]");

    expect(publishSseEventMock).toHaveBeenCalled();
    expect(enqueueTrustScoreRecalcMock).toHaveBeenCalledWith({ agentId: sellerAgentId, reason: "rating.created" });
  });
});

